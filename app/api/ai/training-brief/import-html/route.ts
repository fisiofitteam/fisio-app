/**
 * POST /api/ai/training-brief/import-html?kind=accesorios|entrenamiento
 *
 * Recibe un HTML (multipart/form-data, campo "file") con el histórico de
 * sesiones ADVANCE del CEO y lo importa a AiSessionExample con el kind
 * indicado. Es idempotente: cada sesión se identifica por (kind,
 * source="html-import", dayNumber) y se upsertea.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { parseAdvanceHtml, classifySession } from "@/lib/parse-advance-html";
import { isBriefKind } from "@/lib/ai-training-brief";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const kindParam = req.nextUrl.searchParams.get("kind");
  if (!isBriefKind(kindParam)) {
    return NextResponse.json({ error: "kind requerido (accesorios | entrenamiento)" }, { status: 400 });
  }
  const kind = kindParam;

  let raw: string;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Falta el archivo HTML (campo 'file')" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `Archivo demasiado grande (>${Math.round(MAX_BYTES / 1024 / 1024)}MB)` }, { status: 413 });
    }
    raw = await file.text();
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "No se pudo leer el archivo" }, { status: 400 });
  }

  const sessions = parseAdvanceHtml(raw);
  if (sessions.length === 0) {
    return NextResponse.json(
      { error: "No se encontraron sesiones. ¿El HTML tiene el formato SEMANA/Dia/h4?" },
      { status: 400 }
    );
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (const s of sessions) {
    if (!s.title || s.blocks.length === 0) { skipped++; continue; }
    const { summary, focusTags } = classifySession(s.title, s.blocks);
    const exerciseNames = [...new Set(s.blocks.flatMap((b) => b.exercises))].join(", ");
    const data = {
      kind,
      source: "html-import",
      weekNumber: s.week,
      dayNumber: s.dayNumber,
      title: s.title,
      summary,
      focusTags,
      description: s.description || null,
      blocksJSON: JSON.stringify(s.blocks),
      exerciseNames,
    };
    // Deduplicamos por (kind, source, dayNumber). El mismo dayNumber en dos
    // kinds distintos NO se pisa entre sí.
    const existing = await prisma.aiSessionExample.findFirst({
      where: { kind, source: "html-import", dayNumber: s.dayNumber },
      select: { id: true },
    });
    if (existing) {
      await prisma.aiSessionExample.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.aiSessionExample.create({ data });
      inserted++;
    }
  }

  return NextResponse.json({ ok: true, kind, inserted, updated, skipped, total: sessions.length });
}
