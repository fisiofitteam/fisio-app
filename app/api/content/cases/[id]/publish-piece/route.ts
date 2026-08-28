/**
 * POST /api/content/cases/[id]/publish-piece
 *
 * Convierte el guion generado por /piece en una ContentPiece REAL del
 * calendario editorial. Crea o reutiliza la ContentWeek de la fecha
 * indicada y devuelve el pieceId listo para redirigir al editor visual.
 *
 * Body:
 *   {
 *     format: "carousel" | "stories" | "reel",
 *     generated: { title, hook, caption, slides: [{title, body}], ctaHint },
 *     date?: "YYYY-MM-DD"   // si falta: HOY (usado por carrusel y stories)
 *   }
 *
 * Respuesta: { ok: true, pieceId, weekId, editorUrl }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { isoWeekRange } from "@/lib/content-templates";

export const dynamic = "force-dynamic";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
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
  // 1 = Lunes ... 7 = Domingo (ISO 8601).
  const dow = date.getDay(); // 0 = Domingo ... 6 = Sabado (JS)
  return dow === 0 ? 7 : dow;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const format = String(body?.format ?? "").toLowerCase();
  if (!["carousel", "stories", "reel"].includes(format)) {
    return NextResponse.json({ error: "format debe ser carousel | stories | reel" }, { status: 400 });
  }

  const generated = body?.generated;
  if (!generated || typeof generated !== "object") {
    return NextResponse.json({ error: "generated requerido" }, { status: 400 });
  }
  const title = typeof generated.title === "string" ? generated.title.trim() : "";
  const hook = typeof generated.hook === "string" ? generated.hook.trim() : "";
  const caption = typeof generated.caption === "string" ? generated.caption.trim() : "";
  const ctaHint = typeof generated.ctaHint === "string" ? generated.ctaHint.trim() : "";
  const slidesRaw = Array.isArray(generated.slides) ? generated.slides : [];

  // Fecha destino: si no viene, HOY (usado en carrusel/stories).
  let date: Date;
  if (typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    date = new Date(body.date + "T12:00:00Z"); // mediodia UTC para no bailar de dia
  } else {
    date = new Date();
  }
  const { year, weekNumber } = isoWeekFromDate(date);
  const dayOfWeek = dayOfWeekIso(date);

  // Contexto del caso para nombrar el titulo y prefijar dmKeyword sensato.
  const caseRow = await (prisma as any).clinicalCase.findUnique({
    where: { id: params.id },
    select: { id: true, athleteName: true, injury: true },
  });
  if (!caseRow) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });

  // Reutiliza o crea la ContentWeek (misma logica que apply del Marketer IA).
  let week = await prisma.contentWeek.findFirst({ where: { year, weekNumber } });
  let weekCreated = false;
  if (!week) {
    const { start, end } = isoWeekRange(year, weekNumber);
    week = await prisma.contentWeek.create({
      data: {
        year,
        weekNumber,
        startDate: start,
        endDate: end,
        centralTheme: `Caso · ${caseRow.athleteName}`.slice(0, 100),
        bodyZone: "mixta",
        weekType: "educativa",
        limitingBeliefs: "[]",
        mixValue: 50,
        mixBeliefs: 30,
        mixConversion: 20,
        status: "planning",
      },
    });
    weekCreated = true;
  }

  // Mapea slides → blocks del editor. Formato { id, label, content, order }.
  const blocks = slidesRaw.map((s: any, i: number) => {
    const slideTitle = typeof s?.title === "string" ? s.title.trim() : "";
    const slideBody = typeof s?.body === "string" ? s.body.trim() : "";
    const label = slideTitle
      ? (format === "reel" ? slideTitle : `Slide ${i + 1}${slideTitle ? ` · ${slideTitle}` : ""}`)
      : `Slide ${i + 1}`;
    return {
      id: `slide-${i + 1}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      content: slideBody,
      order: i,
    };
  });

  // Si hay ctaHint y no aparece ya en el caption ni en los blocks, lo
  // añadimos como bloque final (etiquetado como CTA).
  if (ctaHint && !caption.includes(ctaHint)) {
    blocks.push({
      id: `cta-${Math.random().toString(36).slice(2, 8)}`,
      label: "🎯 CTA",
      content: ctaHint,
      order: blocks.length,
    });
  }

  const pieceTitle = title || `${caseRow.athleteName} · ${format}`;

  const piece = await prisma.contentPiece.create({
    data: {
      weekId: week.id,
      dayOfWeek,
      format,
      title: pieceTitle,
      hook: hook || null,
      caption: caption || null,
      goal: "",
      goals: JSON.stringify(["convertir"]),
      ctaType: "",
      dmKeyword: week.leadMagnetKeyword ?? null,
      blocks: JSON.stringify(blocks),
      status: "script",
    },
  });

  return NextResponse.json({
    ok: true,
    pieceId: piece.id,
    weekId: week.id,
    weekCreated,
    editorUrl: `/fisio/contenido/pieza/${piece.id}`,
  });
}
