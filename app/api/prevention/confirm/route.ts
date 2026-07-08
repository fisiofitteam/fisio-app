/**
 * POST /api/prevention/confirm
 *
 * Path síncrono para crear el Patient + PatientSubscription tras volver del
 * checkout de Stripe. Lo llama la página /prevention/gracias con el
 * session_id que Stripe pone en la URL de retorno.
 *
 * Es idempotente:
 *  - Si el checkout no está completed, devuelve 202 (pending).
 *  - Si ya existe PatientSubscription para ese subscriptionId, devuelve
 *    directamente el patientId (no recrea).
 *  - Si no existe Patient con ese email, lo crea con programType=PREVENTION.
 *
 * El webhook (Sprint 5) hará exactamente lo mismo — este endpoint es una
 * red de seguridad para no depender del webhook en el momento del
 * customer return.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe, isPreventionPlan } from "@/lib/stripe";
import { createPreventionSubscription, ensurePreventionRollingProgram } from "@/lib/prevention";
import { createSessionForPatient } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe no configurado" }, { status: 503 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "sessionId inválido" }, { status: 400 });
  }

  let session: any;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });
  } catch (e: any) {
    console.error("[prevention/confirm] Stripe retrieve error:", e);
    return NextResponse.json({ error: "Checkout no encontrado" }, { status: 404 });
  }

  if (session.mode !== "subscription") {
    return NextResponse.json({ error: "Este checkout no es una suscripción" }, { status: 400 });
  }
  if (session.status !== "complete") {
    // Todavía procesándose. La página de gracias hará poll.
    return NextResponse.json({ ok: false, pending: true, status: session.status }, { status: 202 });
  }

  const stripeSubscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id;
  if (!stripeSubscriptionId) {
    return NextResponse.json({ error: "Sesión sin subscription id" }, { status: 500 });
  }

  const plan = session.metadata?.plan;
  if (!isPreventionPlan(plan)) {
    return NextResponse.json({ error: "Plan en metadata no válido" }, { status: 500 });
  }
  const fullName = (session.metadata?.fullName ?? "").toString().trim();
  const phoneFromMeta = (session.metadata?.phone ?? "").toString().trim();
  const email = (session.customer_details?.email ?? session.customer_email ?? "").toString().trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Sesión sin email" }, { status: 500 });
  }

  const stripeCustomerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id;
  const stripePriceId = session.subscription?.items?.data?.[0]?.price?.id ?? null;

  // ─── 1. Localizar o crear Patient ─────────────────────────────────────
  let patient = await prisma.patient.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  let createdNew = false;
  if (!patient) {
    patient = await prisma.patient.create({
      data: {
        fullName: fullName || email.split("@")[0],
        email,
        phone: phoneFromMeta || null,
        programType: "PREVENTION",
        programMode: "rolling",
        subscriptionPeriodMonths: 0, // Prevention no usa el modelo fixed
        subscriptionTotalMonths: 0,
        // NULL a propósito: Prevention no pasa por onboarding (sin anamnesis
        // ni contrato). El gate de /paciente/[id]/layout hace la excepción
        // por programType, pero además dejamos el campo NULL para no
        // ensuciar la BD con tareas que nunca se completarán.
        onboardingTasks: undefined,
      },
    });
    createdNew = true;
  } else if (phoneFromMeta && !patient.phone) {
    // Paciente existente sin phone: aprovechamos que ha completado el
    // checkout para rellenarlo. No pisamos si ya tenía uno guardado.
    patient = await prisma.patient.update({
      where: { id: patient.id },
      data: { phone: phoneFromMeta },
    });
  }

  // ─── 2. Enlazar el paciente al Rolling Prevention activo ─────────────
  // Si no lo hacemos, el home Prevention mostrará "estamos preparando tu
  // semana" indefinidamente aunque haya contenido publicado.
  await ensurePreventionRollingProgram(patient.id);

  // ─── 3. Crear PatientSubscription (idempotente) ───────────────────────
  const subscription = await createPreventionSubscription({
    patientId: patient.id,
    plan,
    stripeSubscriptionId,
    stripeCustomerId: stripeCustomerId ?? null,
    stripePriceId,
    originSource: "landing",
  });

  // ─── 4. Crear sesión web para que el paciente entre directo ───────────
  // Solo la primera vez (createdNew). En reintentos (webhook + confirm),
  // no queremos generar otra cookie de sesión.
  let sessionToken: string | null = null;
  if (createdNew) {
    try {
      sessionToken = await createSessionForPatient(patient.id, {
        userAgent: req.headers.get("user-agent") ?? undefined,
      });
    } catch (e) {
      console.error("[prevention/confirm] failed to create session token:", e);
      sessionToken = null;
    }
  }

  return NextResponse.json({
    ok: true,
    patientId: patient.id,
    subscriptionId: subscription.id,
    isNewPatient: createdNew,
    sessionToken,
  });
}
