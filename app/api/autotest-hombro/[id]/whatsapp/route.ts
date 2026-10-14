import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/autotest-hombro/[id]/whatsapp — marca que el lead ha pulsado
 * el botón de WhatsApp. Idempotente (solo escribe si está null). Usado
 * para el CTR del embudo. Sin rate limit explícito: 1 click por lead es
 * lo normal, y el UI lo manda con sendBeacon.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await (prisma as any).autotestHombroResponse.updateMany({
      where: { id: params.id, whatsappClickAt: null },
      data: { whatsappClickAt: new Date() },
    });
  } catch { /* best effort */ }
  return NextResponse.json({ ok: true });
}
