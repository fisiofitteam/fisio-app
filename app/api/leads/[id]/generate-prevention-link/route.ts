/**
 * POST /api/leads/[id]/generate-prevention-link
 *
 * Genera un link de Stripe Checkout de FisioFit Prevention asociado a un
 * lead concreto. Diferente a /api/prevention/checkout (público, sin lead)
 * y a /api/leads/[id]/generate-payment-link (RECUPERA/CONSOLIDA one-shot).
 *
 * Cuando el atleta paga desde este link, session.metadata.leadId permite
 * al webhook + /api/prevention/confirm marcar el Lead como "won" y
 * vincular el closer, cerrando el ciclo comercial.
 *
 * Body: { plan: "quarterly" | "semiannual" | "annual" }
 * Auth: CEO o closer.
 * Devuelve: { ok, url, plan, productLabel }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import {
  stripe,
  PREVENTION_PLAN_CONFIG,
  getPreventionPriceId,
  isPreventionPlan,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APP_URL = "https://app.fisiofitteam.com";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo" && user.role !== "closer") {
    return NextResponse.json({ error: "Solo CEO o closer pueden generar links" }, { status: 403 });
  }
  if (!stripe) {
    return NextResponse.json({ error: "Stripe no está configurado" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const plan = body?.plan;
  if (!isPreventionPlan(plan)) {
    return NextResponse.json({ error: "Plan no válido" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
  if (lead.status === "lost") {
    return NextResponse.json(
      { error: 'Este lead está marcado como "Perdido". Cámbialo de estado antes.' },
      { status: 400 },
    );
  }

  const priceId = getPreventionPriceId(plan);
  if (!priceId) {
    return NextResponse.json(
      { error: `Precio no configurado en Stripe para ${plan}` },
      { status: 503 },
    );
  }

  const cfg = PREVENTION_PLAN_CONFIG[plan];

  // Extraer email + phone del Lead según su contactType.
  // El closer puede haber guardado el email como aparte, pero contactValue
  // es la fuente autoritaria de lo que sabemos.
  const email = lead.contactType === "email" ? lead.contactValue.trim().toLowerCase() : "";
  const phone = lead.contactType === "phone" ? lead.contactValue.trim() : "";

  const successUrl = `${APP_URL}/prevention/gracias?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${APP_URL}/prevention?cancelled=1`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      // Sin trial en el flujo del closer: el atleta ya ha hablado por
      // teléfono, no necesita el "probar 4 días" de la landing. Pago
      // directo → acceso inmediato.
      subscription_data: {
        metadata: {
          plan,
          origin: "closer-call",
          leadId: lead.id,
          closerId: user.id,
        },
      },
      // customer_email solo si tenemos email fiable. Si no, Stripe lo pedirá
      // en su form (mejor que forzar un email inventado).
      ...(email ? { customer_email: email } : {}),
      metadata: {
        plan,
        productType: "prevention",
        fullName: lead.fullName,
        phone,
        leadId: lead.id,
        closerId: user.id,
        origin: "closer-call",
      },
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      throw new Error("Stripe no devolvió URL de checkout");
    }
    return NextResponse.json({
      ok: true,
      url: session.url,
      plan,
      productLabel: `FisioFit Prevention · ${cfg.label}`,
    });
  } catch (e: any) {
    console.error("[leads/generate-prevention-link] Stripe error:", e);
    return NextResponse.json(
      { error: e?.message ?? "No se pudo generar el link" },
      { status: 502 },
    );
  }
}
