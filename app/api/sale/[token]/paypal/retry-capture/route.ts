/**
 * POST /api/sale/[token]/paypal/retry-capture
 *
 * Reintento manual de captura de una Order PayPal cuando la captura
 * automática en /pagar/gracias falló (bug del array, timeout, red, etc.).
 * El usuario dispara esto pulsando "Reintentar" en la página de gracias.
 *
 * Es la misma lógica que el fallback del endpoint status, pero:
 *  - Es explícito (POST, no polling)
 *  - Devuelve un resultado claro: `ok`, `alreadyPaid`, `expired`, `error`.
 *  - No requiere que el frontend siga polleando; una sola respuesta.
 *
 * PayPal `captureOrder` es idempotente: si ya se capturó, devuelve
 * `ORDER_ALREADY_CAPTURED` y aquí lo tratamos como éxito.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { captureOrder, getOrder } from "@/lib/paypal/orders";
import { paypalCredentials } from "@/lib/paypal/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: { token: string } }) {
  if (!paypalCredentials()) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const sale = await prisma.sale.findUnique({
    where: { paymentToken: params.token },
    select: { id: true, status: true, paypalOrderId: true, paypalCaptureId: true, paymentMethod: true },
  });
  if (!sale) return NextResponse.json({ ok: false, reason: "sale_not_found" }, { status: 404 });
  if (sale.status === "paid") {
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }
  if (!sale.paypalOrderId) {
    return NextResponse.json({ ok: false, reason: "no_order_id" }, { status: 409 });
  }

  try {
    let order = await getOrder(sale.paypalOrderId);
    if (order?.status === "APPROVED") {
      try {
        await captureOrder(sale.paypalOrderId);
        order = await getOrder(sale.paypalOrderId);
      } catch (captureErr: any) {
        // ORDER_ALREADY_CAPTURED = ok, seguimos leyendo el estado.
        const msg = String(captureErr?.message ?? "");
        if (!/ALREADY_CAPTURED|ORDER_ALREADY_CAPTURED/i.test(msg)) {
          console.error("[retry-capture] captureOrder falló:", captureErr);
          if (/EXPIRED|ORDER_EXPIRED/i.test(msg)) {
            return NextResponse.json({ ok: false, reason: "expired" }, { status: 410 });
          }
          return NextResponse.json({ ok: false, reason: "capture_failed", detail: msg }, { status: 500 });
        }
      }
    }

    if (order?.status === "COMPLETED") {
      const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
      await prisma.sale.update({
        where: { id: sale.id },
        data: {
          status: "paid",
          paidAt: new Date(),
          paypalCaptureId: capture?.id ?? sale.paypalCaptureId,
          paymentMethod: sale.paymentMethod ?? "paypal",
        },
      });
      // El webhook seguirá procesando (crear Patient, etc). Si no llega,
      // el endpoint /status ya no tiene nada que hacer porque el Sale está
      // marcado paid — la parte de crear Patient se dispara desde el webhook.
      return NextResponse.json({ ok: true });
    }

    // Order en estado distinto: SAVED/CREATED/VOIDED/PAYER_ACTION_REQUIRED
    if (order?.status === "VOIDED") {
      return NextResponse.json({ ok: false, reason: "voided" }, { status: 410 });
    }
    return NextResponse.json({ ok: false, reason: "not_ready", orderStatus: order?.status ?? null });
  } catch (e: any) {
    console.error("[retry-capture] Error inesperado:", e);
    return NextResponse.json({ ok: false, reason: "unexpected", detail: e?.message ?? "" }, { status: 500 });
  }
}
