/**
 * POST /api/prevention/checkout
 *
 * Punto de entrada público del funnel FisioFit Prevention. Recibe el plan
 * elegido + los datos básicos del lead (email + nombre), y crea una sesión
 * de Stripe Checkout en modo subscription con 4 días de trial.
 *
 * Body: { plan: "quarterly" | "semiannual" | "annual", email, fullName }
 * Response: { url } → el navegador redirige a Stripe.
 *
 * La creación del Patient + PatientSubscription se hace en:
 *   - checkout.session.completed webhook (Sprint 5, camino "oficial").
 *   - /api/prevention/confirm cuando el usuario vuelve del checkout
 *     (Sprint 4 MVP, path síncrono para no depender del webhook).
 */
import { NextResponse } from "next/server";
import {
  stripe,
  PREVENTION_PLAN_CONFIG,
  PREVENTION_TRIAL_DAYS,
  getPreventionPriceId,
  isPreventionPlan,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: "El sistema de pagos no está configurado todavía." },
      { status: 503 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const plan = body?.plan;
  if (!isPreventionPlan(plan)) {
    return NextResponse.json({ error: "Plan no válido" }, { status: 400 });
  }
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const phoneRaw = typeof body?.phone === "string" ? body.phone.trim() : "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email no válido" }, { status: 400 });
  }
  if (!fullName || fullName.length < 2) {
    return NextResponse.json({ error: "Nombre demasiado corto" }, { status: 400 });
  }
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  if (phoneDigits.length < 9) {
    return NextResponse.json({ error: "WhatsApp no válido — incluye prefijo del país" }, { status: 400 });
  }
  // Normalizamos: si trae + delante lo mantenemos, si no, asumimos que ya
  // trae el prefijo internacional pegado (34...) y le anteponemos +.
  const phone = phoneRaw.startsWith("+") ? phoneRaw : `+${phoneDigits}`;

  const priceId = getPreventionPriceId(plan);
  if (!priceId) {
    return NextResponse.json(
      { error: `Precio no configurado en Stripe para el plan ${plan}` },
      { status: 503 }
    );
  }

  const cfg = PREVENTION_PLAN_CONFIG[plan];
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  const successUrl = `${origin}/prevention/gracias?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/prevention?cancelled=1`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: PREVENTION_TRIAL_DAYS,
        metadata: {
          plan,
          origin: "prevention-landing",
        },
      },
      customer_email: email,
      // Pistamos nombre y WhatsApp en los metadatos de la sesión — Stripe
      // no tiene campos estándar para "nombre completo" ni phone en
      // Checkout público. En confirm/webhook los leemos para crear el
      // Patient con phone ya guardado.
      metadata: {
        plan,
        productType: "prevention",
        fullName,
        phone,
      },
      allow_promotion_codes: true,
      billing_address_collection: "required",
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      throw new Error("Stripe no devolvió URL de checkout");
    }
    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("[prevention/checkout] Stripe error:", e);
    return NextResponse.json(
      { error: e?.message ?? "No se pudo iniciar el pago" },
      { status: 502 }
    );
  }
}
