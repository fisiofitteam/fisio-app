/**
 * POST /api/contenido/ia/generar-guion
 *
 * Genera un guion para una ContentPiece usando Claude Opus 4.7. Solo CEO.
 *
 * Body: { pieceId, hook, scriptTemplateId?, freeNote? }
 *
 * Devuelve:
 *   {
 *     blocks: [{ label, content }],
 *     caption: string,
 *     hookVariations: string[]
 *   }
 *
 * NO modifica la pieza — el cliente decide aplicar o descartar tras preview.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getAiBrief } from "@/lib/ai-brief";
import {
  generateScriptWithAI,
  type WeekContext,
  type PieceContext,
  type TemplateContext,
  type TopPiece,
} from "@/lib/ai-content";

export const maxDuration = 90; // segundos — Opus puede tardar 20-40s

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Solo el CEO puede generar guiones con IA" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const pieceId = String(body?.pieceId || "").trim();
  const hook = String(body?.hook || "").trim();
  const scriptTemplateId = body?.scriptTemplateId ? String(body.scriptTemplateId).trim() : null;
  const freeNote = body?.freeNote ? String(body.freeNote).trim() : "";

  if (!pieceId) return NextResponse.json({ error: "pieceId requerido" }, { status: 400 });
  if (!hook) return NextResponse.json({ error: "Hook requerido" }, { status: 400 });

  // ─── Cargar pieza + semana ───
  const piece = await prisma.contentPiece.findUnique({
    where: { id: pieceId },
    include: { week: true },
  });
  if (!piece) return NextResponse.json({ error: "Pieza no encontrada" }, { status: 404 });

  // ─── Plantilla opcional ───
  let template: TemplateContext | null = null;
  if (scriptTemplateId) {
    const tmpl = await prisma.scriptTemplate.findUnique({ where: { id: scriptTemplateId } });
    if (tmpl) {
      let blocks: Array<{ id: string; label: string; order: number }> = [];
      try {
        const parsed = JSON.parse(tmpl.blocks);
        if (Array.isArray(parsed)) {
          blocks = parsed
            .filter((b) => b && typeof b === "object" && typeof b.label === "string")
            .map((b, i) => ({
              id: typeof b.id === "string" ? b.id : `b${i}`,
              label: b.label,
              order: typeof b.order === "number" ? b.order : i,
            }));
        }
      } catch {}
      template = { name: tmpl.name, format: tmpl.format, blocks };
    }
  }

  // ─── Brief IA + contextos ───
  const brief = await getAiBrief();

  const week: WeekContext = {
    centralTheme: piece.week.centralTheme || "(sin tema)",
    bodyZone: piece.week.bodyZone || "(sin zona)",
    weekType: piece.week.weekType || "educativa",
    limitingBeliefs: parseStrArr(piece.week.limitingBeliefs),
    leadMagnetName: piece.week.leadMagnetName,
    leadMagnetKeyword: piece.week.leadMagnetKeyword,
    commercialTrigger: piece.week.commercialTrigger,
  };

  const pieceCtx: PieceContext = {
    format: piece.format,
    goal: piece.goal,
    goals: parseStrArr(piece.goals),
    ctaType: piece.ctaType,
    dayOfWeek: piece.dayOfWeek,
    title: piece.title,
    dmKeyword: piece.dmKeyword,
  };

  // ─── Top 5 piezas con mejores métricas (publicadas, con caption y blocks) ───
  const topPieces = await loadTopPieces(piece.format);

  // ─── Llamada al modelo ───
  let output;
  try {
    output = await generateScriptWithAI({
      brief,
      week,
      piece: pieceCtx,
      template,
      hook,
      freeNote,
      topPieces,
    });
  } catch (e: any) {
    console.error("[ia/generar-guion] error:", e);
    return NextResponse.json(
      { error: e?.message || "Error llamando a la IA" },
      { status: 502 }
    );
  }

  return NextResponse.json(output);
}

function parseStrArr(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v.filter((s) => typeof s === "string");
  } catch {}
  return [];
}

/**
 * Top 5 piezas publicadas con mejor score compuesto. Priorizamos las del MISMO
 * formato (reel mejora reel, carrusel mejora carrusel) pero si hay menos de 5
 * rellenamos con piezas de otro formato. La IA aprende mejor de su mismo medio.
 *
 * Score = reach + saves×3 + dmKeyword×5 + conversions×10. Heurístico simple
 * pero suficiente: prima la calidad (saves, DMs, conversiones) sobre el volumen.
 */
async function loadTopPieces(preferFormat: string): Promise<TopPiece[]> {
  const raw = await prisma.contentPiece.findMany({
    where: {
      status: "published",
      metricsFilledAt: { not: null },
      blocks: { not: "[]" },
    },
    select: {
      format: true,
      hook: true,
      blocks: true,
      caption: true,
      metricsReach: true,
      metricsSaves: true,
      metricsDmKeyword: true,
      metricsConversions: true,
    },
  });

  const scored: TopPiece[] = raw
    .map((p) => {
      const score =
        (p.metricsReach ?? 0) +
        (p.metricsSaves ?? 0) * 3 +
        (p.metricsDmKeyword ?? 0) * 5 +
        (p.metricsConversions ?? 0) * 10;
      let blocks: { label: string; content: string }[] = [];
      try {
        const parsed = JSON.parse(p.blocks);
        if (Array.isArray(parsed)) {
          blocks = parsed
            .filter((b) => b && typeof b === "object")
            .map((b) => ({
              label: typeof b.label === "string" ? b.label : "",
              content: typeof b.content === "string" ? b.content : "",
            }))
            .filter((b) => b.content.trim());
        }
      } catch {}
      return {
        format: p.format,
        hook: p.hook ?? "",
        blocks,
        caption: p.caption,
        score,
      };
    })
    .filter((p) => p.hook.trim() && p.blocks.length > 0)
    .sort((a, b) => b.score - a.score);

  // Mismo formato primero, otros después, máximo 5
  const same = scored.filter((p) => p.format === preferFormat);
  const others = scored.filter((p) => p.format !== preferFormat);
  return [...same, ...others].slice(0, 5);
}
