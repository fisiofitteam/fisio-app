/**
 * POST /api/webhooks/stripe
 *
 * Webhook que escucha eventos de Stripe.
 *
 * Eventos relevantes para FisioFit:
 *   - checkout.session.completed → marca Sale paid, crea Patient (en v57.3)
 *   - payment_intent.payment_failed → marca Sale failed
 *   - charge.refunded → marca Sale refunded
 *
 * En v57.0 solo verifica firma y loguea. La lógica de negocio entra en v57.3.
 *
 * IMPORTANTE: este endpoint DEBE recibir el body como raw text (no parseado),
 * porque Stripe firma el body original. Si Next.js lo parsea como JSON, la
 * firma no coincide.
 */
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

// Forzar dinámico, sin caché
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // necesitamos Node, no edge

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" as any })
  : null;

export async function POST(req: NextRequest) {
  // Si no hay claves configuradas, fallar elegantemente
  if (!stripe || !webhookSecret) {
    console.error("[stripe-webhook] Stripe not configured (STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET missing)");
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  // Leer raw body (requerido para verificar firma)
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("[stripe-webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: `Webhook signature failed: ${err.message}` }, { status: 400 });
  }

  console.log(`[stripe-webhook] Received event: ${event.type} (id=${event.id})`);

  // ─── DISPATCH POR TIPO DE EVENTO ────────────────────────────────────────
  // En v57.0 solo logueamos. v57.3 añadirá lógica real.
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log("[stripe-webhook] checkout.session.completed", {
        sessionId: session.id,
        customerEmail: session.customer_details?.email,
        amountTotal: session.amount_total,
        metadata: session.metadata,
      });
      // TODO v57.3: marcar Sale paid, crear Patient
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      console.log("[stripe-webhook] payment_intent.payment_failed", {
        paymentIntentId: pi.id,
        lastError: pi.last_payment_error?.message,
      });
      // TODO v57.3: marcar Sale failed
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      console.log("[stripe-webhook] charge.refunded", {
        chargeId: charge.id,
        amount: charge.amount_refunded,
      });
      // TODO v57.3: marcar Sale refunded + notificar equipo
      break;
    }
    default:
      console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
