import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/semaforo/[id]/whatsapp — registra que el usuario pulsó
 * el botón "Hablar con Ales por WhatsApp". Se llama con
 * navigator.sendBeacon() ANTES de abrir el enlace de wa.me, para que
 * la métrica no se pierda aunque la pestaña muera al abrir la app.
 *
 * Idempotente: si ya había un click, respetamos el primero.
 * Sin rate limit — es un evento por sesión y por diseño no ocurre
 * repetido salvo por reintento de red.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const existing = await prisma.semaforoRespuesta.findUnique({
    where: { id: params.id },
    select: { id: true, whatsappClickAt: true },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (!existing.whatsappClickAt) {
    await prisma.semaforoRespuesta.update({
      where: { id: params.id },
      data: { whatsappClickAt: new Date() },
    });
  }
  return NextResponse.json({ ok: true });
}
