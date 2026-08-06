import { prisma } from "@/lib/prisma";
import { captureOrder } from "@/lib/paypal/orders";
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
  searchParams: { token?: string; PayerID?: string };
}) {
  const token = searchParams.token || "";
  if (token && searchParams.PayerID) {
    await capturePayPalIfPending(token);
  }
  return <RenewalThankYouClient token={token} />;
}

async function capturePayPalIfPending(token: string): Promise<void> {
  try {
    const checkout = await prisma.renewalCheckout.findUnique({
      where: { paymentToken: token },
      select: { status: true, paypalOrderId: true },
    });
    if (!checkout?.paypalOrderId) return;
    if (checkout.status === "paid") return;
    await captureOrder(checkout.paypalOrderId);
  } catch (e) {
    console.error("[renovar/gracias] Fallo al capturar Order PayPal:", e);
  }
}
