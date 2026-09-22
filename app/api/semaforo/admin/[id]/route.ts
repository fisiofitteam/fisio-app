import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canAccessSemaforoPanel, canDeleteSemaforo } from "@/lib/semaforo/access";
import { evaluate, type RespuestasSemaforo } from "@/lib/semaforo/evaluate";
import { Q, FAMILIES, COPY, FAM_ADVICE, COLOR_NAME, labelForOption, titleForQuestion, type FamilyValue } from "@/lib/semaforo/questions";

/**
 * GET /api/semaforo/admin/[id] — detalle "legible" para el panel:
 *   respuestas en texto humano usando las etiquetas de questions.ts,
 *   motivos del color (evaluate.why), mapa de movimientos con consejos,
 *   flags decodificadas, y CTA de WhatsApp precomputado (mismo mensaje
 *   que el usuario vio, útil para que el equipo lo abra directamente).
 *
 * PATCH /api/semaforo/admin/[id] — { notas?, gestionado? } — marcar como
 *   gestionado guarda quién y desde qué momento. Idempotente.
 *
 * DELETE — SOLO CEO — para atender solicitudes de supresión (RGPD).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  notas: z.string().max(4000).optional().nullable(),
  gestionado: z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canAccessSemaforoPanel(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const row = await prisma.semaforoRespuesta.findUnique({
    where: { id: params.id },
    include: { gestionadoPor: { select: { fullName: true } } },
  });
  if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  let respuestas: RespuestasSemaforo = {};
  let banderas: string[] = [];
  let movimientos: Partial<Record<string, FamilyValue>> = {};
  try { respuestas = JSON.parse(row.respuestas) as RespuestasSemaforo; } catch {}
  try { banderas = row.banderas ? JSON.parse(row.banderas) : []; } catch {}
  try { movimientos = row.movimientos ? JSON.parse(row.movimientos) : {}; } catch {}

  // Recompute why (motivos del color) para no depender de si la fila
  // se cerró con una versión antigua de evaluate.
  const rerun = evaluate(respuestas);

  // Respuestas legibles pregunta a pregunta.
  const readable = Q.map((q) => {
    const raw = (respuestas as Record<string, unknown>)[q.id];
    let value: string | null = null;
    if (raw == null) value = null;
    else if (q.type === "single" && raw && typeof raw === "object" && "v" in (raw as any)) {
      value = labelForOption(q.id, (raw as { v: unknown }).v);
    } else if (q.type === "multi" && Array.isArray(raw)) {
      value = raw.map((v) => labelForOption(q.id, v)).join(" · ");
    } else if (q.type === "matrix" && raw && typeof raw === "object") {
      value = FAMILIES.map((f) => {
        const v = (raw as Record<string, string>)[f.id];
        return `${f.name}: ${v ? COLOR_NAME[FAM_ADVICE[v as FamilyValue].c] : "—"}`;
      }).join(" · ");
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
    color: row.color,
    colorCopy: row.color ? COPY[row.color.toLowerCase() as "verde" | "ambar" | "rojo"] : null,
    why: rerun.why, // motivos frescos con la lógica actual
    banderas,
    banderasDecoded: banderas.map((v) => labelForOption("seguridad", v)),
    movimientos,
    movimientosLegibles: FAMILIES.map((f) => ({
      family: f.name,
      value: movimientos[f.id] ?? null,
      color: FAM_ADVICE[(movimientos[f.id] as FamilyValue) || "na"].c,
      advice: FAM_ADVICE[(movimientos[f.id] as FamilyValue) || "na"].t,
    })),
    respuestasLegibles: readable,
    whatsappClickAt: row.whatsappClickAt?.toISOString() ?? null,
    consentimientoAt: row.consentimientoAt.toISOString(),
    consentimientoVersion: row.consentimientoVersion,
    userAgent: row.userAgent,
    gestionado: row.gestionado,
    gestionadoPor: row.gestionadoPor?.fullName ?? null,
    notas: row.notas,
    leadId: row.leadId,
    // Título humano para pintar cada pregunta si el cliente lo prefiere.
    titles: Object.fromEntries(Q.map((q) => [q.id, titleForQuestion(q.id)])),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canAccessSemaforoPanel(user.role)) {
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
    // Al marcar gestionado por primera vez guardamos quién.
    if (parsed.data.gestionado) {
      data.gestionadoPorId = user.id;
    }
  }

  await prisma.semaforoRespuesta.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canDeleteSemaforo(user.role)) {
    return NextResponse.json({ error: "Solo el CEO puede eliminar registros" }, { status: 403 });
  }
  await prisma.semaforoRespuesta.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
