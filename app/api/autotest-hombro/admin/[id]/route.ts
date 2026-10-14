import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canAccessAutotestPanel, canDeleteAutotest } from "@/lib/autotest-hombro/access";
import { evaluate, type Respuestas } from "@/lib/autotest-hombro/evaluate";
import { Q, labelForOption, titleForQuestion } from "@/lib/autotest-hombro/preguntas";
import { AREAS } from "@/lib/autotest-hombro/areas";
import { arquetipoById } from "@/lib/autotest-hombro/arquetipos";

/**
 * GET  /api/autotest-hombro/admin/[id] — detalle legible para el panel.
 *   Reconstruye las respuestas en texto humano, recomputa scores por si
 *   la fila se cerró con lógica antigua, pinta nombre del arquetipo.
 *
 * PATCH /api/autotest-hombro/admin/[id] — { notas?, gestionado? }
 *
 * DELETE — solo CEO (RGPD).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  notas: z.string().max(4000).optional().nullable(),
  gestionado: z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canAccessAutotestPanel(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const row = await (prisma as any).autotestHombroResponse.findUnique({
    where: { id: params.id },
    include: { gestionadoPor: { select: { fullName: true } } },
  });
  if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  let respuestas: Respuestas = {};
  try { respuestas = JSON.parse(row.respuestas) as Respuestas; } catch {}

  // Recompute para resistir cambios de deltas; en EN_CURSO también sirve
  // para previsualizar los scores parciales.
  const rerun = evaluate(respuestas);
  const arquetipoMeta = arquetipoById(row.arquetipo ?? rerun.arquetipoId);

  const readable = Q.map((q) => {
    const raw = (respuestas as Record<string, unknown>)[q.id];
    let value: string | null = null;
    if (raw == null) value = null;
    else if (q.type === "single" && raw && typeof raw === "object" && "v" in (raw as any)) {
      value = labelForOption(q.id, (raw as { v: unknown }).v);
    } else if (q.type === "text") {
      value = typeof raw === "string" ? raw : null;
    }
    return {
      questionId: q.id,
      title: q.title,
      section: q.section,
      value,
    };
  });

  return NextResponse.json({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    instagram: row.instagram,
    nombre: row.nombre,
    telefono: row.telefono,
    campana: row.campana,
    estado: row.estado,
    ultimoPaso: row.ultimoPaso,
    arquetipo: row.arquetipo ?? rerun.arquetipoId,
    arquetipoTitle: arquetipoMeta?.title ?? null,
    arquetipoEmoji: arquetipoMeta?.emoji ?? null,
    arquetipoSummary: arquetipoMeta?.summary ?? null,
    scores: rerun.scores,
    areasOrdered: AREAS.map((a) => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji,
      score: rerun.scores[a.id],
    })),
    respuestasLegibles: readable,
    titles: Object.fromEntries(Q.map((q) => [q.id, titleForQuestion(q.id)])),
    whatsappClickAt: row.whatsappClickAt?.toISOString() ?? null,
    consentimientoAt: row.consentimientoAt.toISOString(),
    consentimientoVersion: row.consentimientoVersion,
    userAgent: row.userAgent,
    gestionado: row.gestionado,
    gestionadoPor: row.gestionadoPor?.fullName ?? null,
    notas: row.notas,
    leadId: row.leadId,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canAccessAutotestPanel(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload inválido" },
      { status: 400 },
    );
  }
  const data: Record<string, unknown> = {};
  if (parsed.data.notas !== undefined) data.notas = parsed.data.notas?.trim() || null;
  if (parsed.data.gestionado !== undefined) {
    data.gestionado = parsed.data.gestionado;
    if (parsed.data.gestionado) data.gestionadoPorId = user.id;
  }
  await (prisma as any).autotestHombroResponse.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canDeleteAutotest(user.role)) {
    return NextResponse.json({ error: "Solo el CEO puede eliminar registros" }, { status: 403 });
  }
  await (prisma as any).autotestHombroResponse.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
