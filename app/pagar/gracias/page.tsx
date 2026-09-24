import { prisma } from "@/lib/prisma";
import { captureOrder, getOrder } from "@/lib/paypal/orders";
import { activateSaleAsPatient } from "@/lib/paypal/activation";
import { ThankYouClient } from "@/components/ThankYouClient";

export const metadata = {
  title: "¡Gracias! · FisioFit Team",
  description: "Tu pago se ha completado correctamente.",
};

export const dynamic = "force-dynamic";

/**
 * Landing de gracias tras el pago. Sirve para dos flujos:
 *
 *  - **Stripe** (heredado): la webhook `checkout.session.completed`
 *    ya ha marcado el Sale como paid antes de que el usuario aterrice aquí.
 *    El componente cliente polea el status hasta confirmarlo.
 *
 *  - **PayPal** (nuevo): PayPal solo AUTORIZA el pago con el approve; el
 *    charge real se hace con una llamada de captura. Al aterrizar aquí
 *    detectamos que venimos de PayPal (query `PayerID` presente, o Sale
 *    con paypalOrderId pendiente) y lanzamos el capture server-side.
 *    El webhook PAYMENT.CAPTURE.COMPLETED que se dispara tras el capture
 *    hace el trabajo pesado (crear Patient, marcar Sale paid, etc). El
 *    polling del cliente detecta el cambio a paid y sigue el flujo normal.
 *
 * Si el capture falla o si el Sale ya estaba paid (webhook llegó antes),
 * dejamos que el cliente hago su polling normal — captureOrder es
 * idempotente pero no queremos abortar el render por un error de captura.
 */
export default async function GraciasPage({
  searchParams,
}: {
  searchParams: { token?: string | string[]; session_id?: string | string[]; PayerID?: string | string[] };
}) {
  // PayPal añade su propio ?token=<orderId>&PayerID=... al returnUrl que ya
  // llevaba nuestro ?token=<paymentToken>. Next.js devuelve ese `token` como
  // array de dos strings. El primero es SIEMPRE nuestro paymentToken (viaja
  // en el returnUrl original); el segundo es el orderId de PayPal.
  const rawToken = searchParams.token;
  const paymentToken = Array.isArray(rawToken) ? rawToken[0] ?? "" : rawToken ?? "";
  const paypalOrderIdFromUrl = Array.isArray(rawToken) ? rawToken[1] : null;
  const payerId = firstStr(searchParams.PayerID);
  const sessionId = firstStr(searchParams.session_id);

  // FIX 2026-09-24: capturar SIEMPRE que haya paymentToken, aunque el
  // PayerID no llegue en la URL (frecuente en móviles cuando el usuario
  // vuelve a la app de PayPal y luego al navegador — PayPal a veces pierde
  // el PayerID pero el Order sigue APPROVED). Antes solo capturábamos con
  // PayerID; ahora consultamos el estado real del Order y capturamos si
  // está APPROVED. Este era el bug que dejaba a los pacientes con el hold
  // del banco activo hasta que PayPal purgaba el Order a las 72h.
  if (paymentToken) {
    await capturePayPalIfPending(paymentToken, paypalOrderIdFromUrl);
  }

  return <ThankYouClient token={paymentToken} sessionId={sessionId} />;
}

function firstStr(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

async function capturePayPalIfPending(paymentToken: string, orderIdFromUrl: string | null): Promise<void> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { paymentToken },
      select: { id: true, status: true, paypalOrderId: true, paypalCaptureId: true, paymentMethod: true, patientId: true },
    });
    if (!sale) {
      console.log("[pagar/gracias] Sale no encontrado", { paymentToken: paymentToken.slice(0, 8) + "…" });
      return;
    }
    if (sale.status === "paid" && sale.patientId) {
      console.log("[pagar/gracias] Sale ya activado", { saleId: sale.id });
      return;
    }
    const orderId = orderIdFromUrl ?? sale.paypalOrderId;
    if (!orderId) {
      console.log("[pagar/gracias] Sale sin orderId, imposible capturar", { saleId: sale.id });
      return;
    }

    // Consultar estado real. Si está APPROVED capturamos. Si ya COMPLETED,
    // solo activamos. Idempotente end-to-end.
    let order = await getOrder(orderId);
    console.log("[pagar/gracias] Order status", { saleId: sale.id, orderId, status: order?.status });

    if (order?.status === "APPROVED") {
      try {
        await captureOrder(orderId);
        order = await getOrder(orderId);
        console.log("[pagar/gracias] Post-capture status", { saleId: sale.id, status: order?.status });
      } catch (captureErr: any) {
        const msg = String(captureErr?.message ?? "");
        if (!/ALREADY_CAPTURED/i.test(msg)) {
          console.error("[pagar/gracias] captureOrder falló:", captureErr);
          return;
        }
        order = await getOrder(orderId);
      }
    }

    if (order?.status === "COMPLETED") {
      const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
      const detectPayLater = JSON.stringify(capture ?? {}).toLowerCase().includes("pay_later")
        || JSON.stringify(capture ?? {}).toLowerCase().includes("paylater");
      await activateSaleAsPatient({
        saleId: sale.id,
        paymentMethod: sale.paymentMethod ?? (detectPayLater ? "paypal_paylater" : "paypal"),
        paypalCaptureId: capture?.id ?? sale.paypalCaptureId,
      });
      console.log("[pagar/gracias] Sale activado", { saleId: sale.id });
    }
  } catch (e) {
    console.error("[pagar/gracias] Fallo al capturar/activar Order PayPal:", e);
  }
}
