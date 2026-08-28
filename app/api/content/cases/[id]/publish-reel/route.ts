/**
 * POST /api/content/cases/[id]/publish-reel
 *
 * Flujo especifico del REEL: en vez de usar el generador simple del caso
 * (que da hook + caption solamente), este endpoint:
 *   1. Crea una ContentPiece basica (format=reel, en la semana de la fecha).
 *   2. Llama al MISMO generador de guiones IA que usa el editor de pieza
 *      (Opus 4.7 con brief, week, top piezas publicadas como few-shot).
 *   3. Persiste blocks + caption + hook devueltos.
 *   4. Devuelve editorUrl para redirigir al editor visual del guion.
 *
 * El generador oficial produce PLANOS DETALLADOS (Plano 1 · gancho 3s,
 * Plano 2 · desarrollo, etc.) mucho mejor que el generador generico del
 * caso.
 *
 * Body: { date: "YYYY-MM-DD" }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getAiBrief } from "@/lib/ai-brief";
import { isoWeekRange } from "@/lib/content-templates";
import { generateScriptWithAI, type WeekContext, type PieceContext, type TopPiece } from "@/lib/ai-content";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function canAccess(role: string): boolean {
  return role === "ceo";
}

function isoWeekFromDate(date: Date): { year: number; weekNumber: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), weekNumber };
}
function dayOfWeekIso(date: Date): number {
  const dow = date.getDay();
  return dow === 0 ? 7 : dow;
}

async function loadTopReels(): Promise<TopPiece[]> {
  const raw = await prisma.contentPiece.findMany({
    where: {
      status: "published",
      metricsFilledAt: { not: null },
      blocks: { not: "[]" },
      format: "reel",
    },
    select: {
      format: true, hook: true, blocks: true, caption: true,
      metricsReach: true, metricsSaves: true, metricsDmKeyword: true, metricsConversions: true,
    },
  });
  return raw
    .map((p) => {
      const score = (p.metricsReach ?? 0) + (p.metricsSaves ?? 0) * 3 + (p.metricsDmKeyword ?? 0) * 5 + (p.metricsConversions ?? 0) * 10;
      let blocks: { label: string; content: string }[] = [];
      try {
        const parsed = JSON.parse(p.blocks);
        if (Array.isArray(parsed)) blocks = parsed.filter((b) => b && typeof b === "object").map((b) => ({ label: typeof b.label === "string" ? b.label : "", content: typeof b.content === "string" ? b.content : "" }));
      } catch { /* ignore */ }
      return { format: p.format, hook: p.hook ?? "", blocks, caption: p.caption, score };
    })
    .sort((a, b) => (b as any).score - (a as any).score)
    .slice(0, 5);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  let date: Date;
  if (typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    date = new Date(body.date + "T12:00:00Z");
  } else {
    date = new Date();
  }
  const { year, weekNumber } = isoWeekFromDate(date);
  const dayOfWeek = dayOfWeekIso(date);

  const caseRow = await (prisma as any).clinicalCase.findUnique({
    where: { id: params.id },
    select: {
      id: true, athleteName: true, injury: true,
      shortSummary: true, initialSituation: true, process: true, obstacles: true, achievements: true,
    },
  });
  if (!caseRow) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });

  const hasNarrative = !!(caseRow.initialSituation || caseRow.process);
  if (!hasNarrative) {
    return NextResponse.json({ error: "El caso todavía no tiene narrativa. Genera primero el borrador con IA." }, { status: 400 });
  }

  // Semana (reutiliza o crea).
  let week = await prisma.contentWeek.findFirst({ where: { year, weekNumber } });
  if (!week) {
    const { start, end } = isoWeekRange(year, weekNumber);
    week = await prisma.contentWeek.create({
      data: {
        year, weekNumber, startDate: start, endDate: end,
        centralTheme: `Caso · ${caseRow.athleteName}`.slice(0, 100),
        bodyZone: "mixta", weekType: "educativa", limitingBeliefs: "[]",
        mixValue: 50, mixBeliefs: 30, mixConversion: 20,
        status: "planning",
      },
    });
  }

  // Pieza basica — la rellenamos con el generador oficial a continuacion.
  const piece = await prisma.contentPiece.create({
    data: {
      weekId: week.id,
      dayOfWeek,
      format: "reel",
      title: `Reel · ${caseRow.athleteName}`.slice(0, 200),
      hook: null,
      caption: null,
      goal: "",
      goals: JSON.stringify(["convertir"]),
      ctaType: "",
      dmKeyword: week.leadMagnetKeyword ?? null,
      blocks: "[]",
      status: "idea",
    },
  });

  // Construimos instructions ricas para el generador oficial: el caso
  // entero condensado + directrices claras de que queremos.
  const instructions = [
    `Reel narrativo basado en el caso REAL del atleta ${caseRow.athleteName}${caseRow.injury ? ` (${caseRow.injury})` : ""}.`,
    "",
    caseRow.shortSummary ? `Resumen: ${caseRow.shortSummary}` : "",
    "",
    "==== CÓMO ESTABA ====",
    caseRow.initialSituation ?? "(sin datos)",
    "",
    "==== SU PROCESO ====",
    caseRow.process ?? "(sin datos)",
    "",
    "==== OBSTÁCULOS SUPERADOS ====",
    caseRow.obstacles ?? "(sin datos)",
    "",
    "==== QUÉ HA CONSEGUIDO ====",
    caseRow.achievements ?? "(sin datos)",
    "",
    "==== DIRECTRICES ====",
    "- Reel de 30-60 segundos, narrativa emocional en tercera persona (o directamente a cámara si aportas Ales/fisio hablando).",
    "- Estructura: hook 3s + contexto + inflexión + resultado + CTA final.",
    "- Historia humana ante todo: cómo se sentía, qué temía perder, qué le devolvió el proceso. Los datos duros van al final como cierre.",
    "- Cero escalas numéricas (nada de 7/10, RPE, %adherencia). Traduce a lenguaje humano.",
    "- Cero nombres técnicos de programas (RECUPERA, CONSOLIDA...). Di 'el proceso' o 'el plan'.",
    "- Si hay citas literales del atleta en el caso, úsalas entre comillas.",
    "- CTA final: pedir DM con palabra clave relacionada con la lesión, o mensaje directo tipo 'cuéntame por DM qué te está pasando'.",
  ].filter(Boolean).join("\n");

  // Contextos para el generador (mismo formato que /api/contenido/ia/generar-guion).
  const brief = await getAiBrief();
  const weekCtx: WeekContext = {
    centralTheme: week.centralTheme || "(sin tema)",
    bodyZone: week.bodyZone || "(sin zona)",
    weekType: week.weekType || "educativa",
    limitingBeliefs: [],
    leadMagnetName: week.leadMagnetName,
    leadMagnetKeyword: week.leadMagnetKeyword,
    commercialTrigger: week.commercialTrigger,
  };
  const pieceCtx: PieceContext = {
    format: "reel",
    goal: "",
    goals: ["convertir"],
    ctaType: "",
    dayOfWeek,
    title: piece.title,
    dmKeyword: piece.dmKeyword,
  };
  const topPieces = await loadTopReels();

  try {
    const output = await generateScriptWithAI({
      brief,
      week: weekCtx,
      piece: pieceCtx,
      template: null,
      instructions,
      hook: undefined,
      freeNote: "",
      topPieces,
    });

    // Persistimos el guion generado en la pieza.
    const blocks = (output.blocks ?? []).map((b: any, i: number) => ({
      id: `b-${i + 1}-${Math.random().toString(36).slice(2, 8)}`,
      label: String(b.label ?? `Plano ${i + 1}`),
      content: String(b.content ?? ""),
      order: i,
    }));
    const hookChosen = (output.hookVariations?.[0] ?? "").trim() || null;

    await prisma.contentPiece.update({
      where: { id: piece.id },
      data: {
        hook: hookChosen,
        caption: (output.caption ?? "").trim() || null,
        blocks: JSON.stringify(blocks),
        status: "script",
      },
    });
  } catch (e: any) {
    console.error("[cases/publish-reel] generateScriptWithAI:", e);
    // La pieza ya está creada aunque falle la IA — el usuario podrá
    // pulsar "Generar con IA" desde el editor de la pieza para intentar
    // otra vez con la misma información.
    return NextResponse.json({
      ok: true,
      warning: `Pieza creada pero el guion IA falló: ${e?.message ?? "desconocido"}. Ábrelo y reintenta.`,
      editorUrl: `/fisio/contenido/pieza/${piece.id}`,
    });
  }

  return NextResponse.json({
    ok: true,
    editorUrl: `/fisio/contenido/pieza/${piece.id}`,
  });
}
