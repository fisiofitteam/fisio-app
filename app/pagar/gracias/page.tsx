import { prisma } from "@/lib/prisma";
import { captureOrder } from "@/lib/paypal/orders";
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
  searchParams: { token?: string; session_id?: string; PayerID?: string };
}) {
  const token = searchParams.token || "";

  // Si venimos de PayPal, capturar antes de mostrar la página.
  if (token && searchParams.PayerID) {
    await capturePayPalIfPending(token);
  }

  return <ThankYouClient token={token} sessionId={searchParams.session_id || ""} />;
}

async function capturePayPalIfPending(token: string): Promise<void> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { paymentToken: token },
      select: { id: true, status: true, paypalOrderId: true },
    });
    if (!sale?.paypalOrderId) return;
    if (sale.status === "paid") return; // webhook llegó antes
    // Captura idempotente: PayPal devuelve el mismo resultado si repetimos.
    await captureOrder(sale.paypalOrderId);
    // La webhook PAYMENT.CAPTURE.COMPLETED se dispara aquí y hace el resto.
  } catch (e) {
    console.error("[pagar/gracias] Fallo al capturar Order PayPal:", e);
    // No bloqueamos el render — el user ve la pantalla de "estamos
    // procesando" y si finalmente el webhook nunca llega, verá el error
    // tras 60s de polling (mismo comportamiento que teníamos con Stripe).
  }
}
