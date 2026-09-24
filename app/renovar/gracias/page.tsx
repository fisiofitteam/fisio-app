import { prisma } from "@/lib/prisma";
import { captureOrder, getOrder } from "@/lib/paypal/orders";
import { applyRenewalCheckoutPaid } from "@/lib/paypal/activation";
import { RenewalThankYouClient } from "@/components/RenewalThankYouClient";

export const dynamic = "force-dynamic";

/**
 * Landing de gracias tras el pago de una RENOVACIÓN. Dos flujos:
 *
 *  - **Stripe** (heredado): la webhook `checkout.session.completed` con
 *    metadata.kind=renewal ya ha marcado el RenewalCheckout como paid.
 *
 *  - **PayPal** (Fase 3): PayPal solo autoriza en approve; hay que capturar
 *    server-side. Detectamos que venimos de PayPal por `PayerID` y lanzamos
 *    la captura del Order asociado al RenewalCheckout. El webhook
 *    PAYMENT.CAPTURE.COMPLETED (custom_id="renewal:xxx") aplica la renovación.
 *
 * En pagos de N cuotas no llega `PayerID` sino `subscription_id`; en ese caso
 * PayPal ya dispara BILLING.SUBSCRIPTION.ACTIVATED sin necesidad de capturar.
 */
export default async function RenewalThankYouPage({
  searchParams,
}: {
  searchParams: { token?: string | string[]; PayerID?: string | string[] };
}) {
  // PayPal añade su propio ?token=<orderId>&PayerID=... al returnUrl que ya
  // llevaba nuestro ?token=<paymentToken>. Next.js devuelve ese `token` como
  // array de dos strings. El primero es nuestro paymentToken; el segundo el
  // orderId de PayPal (ver comentario extendido en pagar/gracias/page.tsx).
  const rawToken = searchParams.token;
  const paymentToken = Array.isArray(rawToken) ? rawToken[0] ?? "" : rawToken ?? "";
  const paypalOrderIdFromUrl = Array.isArray(rawToken) ? rawToken[1] : null;
  const payerId = Array.isArray(searchParams.PayerID) ? searchParams.PayerID[0] : searchParams.PayerID;

  // FIX 2026-09-24: capturar SIEMPRE que haya paymentToken (aunque no
  // llegue PayerID, frecuente en móviles). Consulta el estado real del
  // Order y captura+activa si está APPROVED/COMPLETED. Antes se quedaba
  // colgado y a las 72h PayPal purgaba el hold → banco devolvía.
  if (paymentToken) {
    await capturePayPalIfPending(paymentToken, paypalOrderIdFromUrl ?? null);
  }
  return <RenewalThankYouClient token={paymentToken} />;
}

async function capturePayPalIfPending(paymentToken: string, orderIdFromUrl: string | null): Promise<void> {
  try {
    const checkout = await prisma.renewalCheckout.findUnique({
      where: { paymentToken },
      select: { id: true, status: true, paypalOrderId: true, paypalCaptureId: true, renewalId: true },
    });
    if (!checkout) {
      console.log("[renovar/gracias] Checkout no encontrado", { paymentToken: paymentToken.slice(0, 8) + "…" });
      return;
    }
    if (checkout.status === "paid" && checkout.renewalId) {
      console.log("[renovar/gracias] Checkout ya activado", { checkoutId: checkout.id });
      return;
    }
    const orderId = orderIdFromUrl ?? checkout.paypalOrderId;
    if (!orderId) {
      console.log("[renovar/gracias] Checkout sin orderId, imposible capturar", { checkoutId: checkout.id });
      return;
    }
    let order = await getOrder(orderId);
    console.log("[renovar/gracias] Order status", { checkoutId: checkout.id, orderId, status: order?.status });
    if (order?.status === "APPROVED") {
      try {
        await captureOrder(orderId);
        order = await getOrder(orderId);
      } catch (captureErr: any) {
        const msg = String(captureErr?.message ?? "");
        if (!/ALREADY_CAPTURED/i.test(msg)) {
          console.error("[renovar/gracias] captureOrder falló:", captureErr);
          return;
        }
        order = await getOrder(orderId);
      }
    }
    if (order?.status === "COMPLETED") {
      const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
      const detectPayLater = JSON.stringify(capture ?? {}).toLowerCase().includes("pay_later")
        || JSON.stringify(capture ?? {}).toLowerCase().includes("paylater");
      await applyRenewalCheckoutPaid({
        checkoutId: checkout.id,
        paymentMethod: detectPayLater ? "paypal_paylater" : "paypal",
        paypalCaptureId: capture?.id ?? checkout.paypalCaptureId,
        isSubscription: false,
      });
      console.log("[renovar/gracias] Renewal activado", { checkoutId: checkout.id });
    }
  } catch (e) {
    console.error("[renovar/gracias] Fallo al capturar/activar Order PayPal:", e);
  }
}
