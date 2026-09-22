import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { evaluate, colorToStored, type RespuestasSemaforo } from "@/lib/semaforo/evaluate";
import { getClientIp, maybeCleanupBuckets, rateLimit } from "@/lib/semaforo/rate-limit";

/**
 * PATCH /api/semaforo/[id] — guarda progreso del test.
 *
 * Reglas:
 *  - Solo se puede modificar un registro EN_CURSO creado hace <2h.
 *  - Aceptamos actualizaciones de: respuestas, ultimoPaso, y datos
 *    finales (nombre, telefono, instagram si el usuario los rellena
 *    cuando no venían por querystring).
 *  - Estados de cierre:
 *      * "alarma"     → estado=ALARMA + banderas guardadas.
 *      * "completado" → estado=COMPLETADO + color/movimientos calculados
 *                       server-side con evaluate(). Ignoramos el color
 *                       que envía el cliente.
 *
 * Rate limit: 60 PATCH/min por IP (el test hace uno por paso).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  respuestas: z.record(z.string(), z.any()).optional(),
  ultimoPaso: z.number().int().min(0).max(50).optional(),
  nombre: z.string().max(80).optional().nullable(),
  telefono: z.string().max(30).optional().nullable(),
  instagram: z.string().max(60).optional().nullable(),
  // Cierre: uno de estos dos, opcional. No confiamos en el color.
  cerrar: z.enum(["alarma", "completado"]).optional(),
  banderas: z.array(z.string()).optional(),
});

const MAX_AGE_MS = 2 * 60 * 60 * 1000;

// Tamaño duro para no aceptar payloads gigantes.
function payloadTooBig(body: unknown): boolean {
  try {
    return JSON.stringify(body).length > 20_000;
  } catch {
    return true;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  maybeCleanupBuckets();
  const ip = getClientIp(req);
  if (!rateLimit(ip, "semaforo:patch", { limit: 60, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  const raw = await req.json().catch(() => null);
  if (!raw || payloadTooBig(raw)) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload inválido" },
      { status: 400 },
    );
  }

  const existing = await prisma.semaforoRespuesta.findUnique({
    where: { id: params.id },
    select: { id: true, estado: true, createdAt: true, respuestas: true },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (existing.estado !== "EN_CURSO") {
    return NextResponse.json({ error: "Este registro ya está cerrado" }, { status: 409 });
  }
  if (Date.now() - existing.createdAt.getTime() > MAX_AGE_MS) {
    return NextResponse.json({ error: "La sesión del test caducó" }, { status: 410 });
  }

  const data: Record<string, unknown> = {};

  if (parsed.data.respuestas !== undefined) {
    // Mergeamos con lo que ya había — así si el cliente reintenta un
    // paso concreto no perdemos el resto.
    let current: RespuestasSemaforo = {};
    try {
      current = JSON.parse(existing.respuestas) as RespuestasSemaforo;
    } catch {
      current = {};
    }
    const merged = { ...current, ...parsed.data.respuestas };
    data.respuestas = JSON.stringify(merged);
  }
  if (parsed.data.ultimoPaso !== undefined) data.ultimoPaso = parsed.data.ultimoPaso;
  if (parsed.data.nombre !== undefined) data.nombre = parsed.data.nombre?.trim() || null;
  if (parsed.data.telefono !== undefined) data.telefono = parsed.data.telefono?.trim() || null;
  if (parsed.data.instagram !== undefined) {
    // Reutilizamos el sanitizador para el caso en que el usuario lo
    // escriba manualmente en el paso final.
    const clean = (parsed.data.instagram ?? "").trim().replace(/^@+/, "").toLowerCase();
    data.instagram = /^[a-z0-9._]{1,30}$/.test(clean) ? clean : null;
  }

  // Cierre a ALARMA — no recalcula color, solo persiste banderas.
  if (parsed.data.cerrar === "alarma") {
    data.estado = "ALARMA";
    if (parsed.data.banderas) data.banderas = JSON.stringify(parsed.data.banderas);
  }

  // Cierre a COMPLETADO — recalculamos con la misma función evaluate()
  // que usa el cliente. El servidor siempre gana.
  if (parsed.data.cerrar === "completado") {
    let respuestasParaEvaluar: RespuestasSemaforo = {};
    try {
      const merged = data.respuestas ? JSON.parse(String(data.respuestas)) : JSON.parse(existing.respuestas);
      respuestasParaEvaluar = merged as RespuestasSemaforo;
    } catch {
      respuestasParaEvaluar = {};
    }
    const result = evaluate(respuestasParaEvaluar);
    data.estado = "COMPLETADO";
    data.color = colorToStored(result.color);
    data.banderas = JSON.stringify(result.flags);
    data.movimientos = JSON.stringify(result.mov);
  }

  await prisma.semaforoRespuesta.update({ where: { id: params.id }, data });

  return NextResponse.json({ ok: true });
}
