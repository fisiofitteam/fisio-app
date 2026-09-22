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

  if (paymentToken && payerId) {
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
      select: { id: true, status: true, paypalOrderId: true },
    });
    if (!sale) return;
    if (sale.status === "paid") return; // webhook llegó antes
    // Preferimos el orderId que trae PayPal en la URL (garantizado) sobre el
    // que hayamos guardado en BD (puede faltar si el POST original falló).
    const orderId = orderIdFromUrl ?? sale.paypalOrderId;
    if (!orderId) return;
    // Captura idempotente: PayPal devuelve el mismo resultado si repetimos.
    await captureOrder(orderId);
    // La webhook PAYMENT.CAPTURE.COMPLETED se dispara aquí y hace el resto.
  } catch (e) {
    console.error("[pagar/gracias] Fallo al capturar Order PayPal:", e);
    // No bloqueamos el render — el user ve la pantalla de "estamos
    // procesando" y si finalmente el webhook nunca llega, verá el error
    // tras 60s de polling (mismo comportamiento que teníamos con Stripe).
  }
}
