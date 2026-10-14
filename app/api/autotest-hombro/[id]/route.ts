import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { evaluate, type Respuestas } from "@/lib/autotest-hombro/evaluate";
import { getClientIp, maybeCleanupBuckets, rateLimit } from "@/lib/semaforo/rate-limit";

/**
 * PATCH /api/autotest-hombro/[id]
 *
 * Guarda progreso del autotest y, opcionalmente, lo cierra. Reglas:
 *   - Solo se modifican registros EN_CURSO creados hace <2 h.
 *   - El merge de `respuestas` conserva lo que ya hubiera (idempotente).
 *   - `cerrar: "completado"` → el servidor recalcula scores + arquetipo
 *     con evaluate() y persiste. Ignora los que llegue del cliente.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  respuestas: z.record(z.string(), z.any()).optional(),
  ultimoPaso: z.number().int().min(0).max(50).optional(),
  nombre: z.string().max(80).nullable().optional(),
  telefono: z.string().max(30).nullable().optional(),
  instagram: z.string().max(60).nullable().optional(),
  cerrar: z.enum(["completado"]).optional(),
});

const MAX_AGE_MS = 2 * 60 * 60 * 1000;

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
  if (!rateLimit(ip, "autotest:patch", { limit: 60, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  const raw = await req.json().catch(() => null);
  if (!raw || payloadTooBig(raw)) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Payload inválido" },
      { status: 400 },
    );
  }

  const existing = await (prisma as any).autotestHombroResponse.findUnique({
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
    let current: Respuestas = {};
    try {
      current = JSON.parse(existing.respuestas) as Respuestas;
    } catch {
      current = {};
    }
    data.respuestas = JSON.stringify({ ...current, ...parsed.data.respuestas });
  }
  if (parsed.data.ultimoPaso !== undefined) data.ultimoPaso = parsed.data.ultimoPaso;
  if (parsed.data.nombre !== undefined) data.nombre = parsed.data.nombre?.trim() || null;
  if (parsed.data.telefono !== undefined) data.telefono = parsed.data.telefono?.trim() || null;
  if (parsed.data.instagram !== undefined) {
    const clean = (parsed.data.instagram ?? "").trim().replace(/^@+/, "").toLowerCase();
    data.instagram = /^[a-z0-9._]{1,30}$/.test(clean) ? clean : null;
  }

  if (parsed.data.cerrar === "completado") {
    let respuestasParaEvaluar: Respuestas = {};
    try {
      const merged = data.respuestas
        ? JSON.parse(String(data.respuestas))
        : JSON.parse(existing.respuestas);
      respuestasParaEvaluar = merged as Respuestas;
    } catch {
      respuestasParaEvaluar = {};
    }
    const result = evaluate(respuestasParaEvaluar);
    data.estado = "COMPLETADO";
    data.scores = JSON.stringify(result.scores);
    data.arquetipo = result.arquetipoId;
  }

  await (prisma as any).autotestHombroResponse.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ ok: true });
}
