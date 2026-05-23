/**
 * POST /api/webhooks/stripe
 *
 * Webhook que escucha eventos de Stripe.
 *
 * Eventos procesados:
 *   - checkout.session.completed → marca Sale paid, crea Patient, notifica a Miguel
 *   - payment_intent.payment_failed → marca Sale failed, notifica al closer
 *   - charge.refunded → marca Sale refunded, notifica a head_success
 *
 * Diseño:
 * - IDEMPOTENTE: si Stripe reintenta (reentregas, webhooks múltiples), no
 *   creamos Patients duplicados ni dobles notificaciones.
 * - TRANSACCIONAL: la creación de Patient + update Sale + update Lead se hace
 *   en una sola transacción Prisma para no dejar estados inconsistentes.
 * - Falla a 200 cuando no podemos hacer nada útil (sale no encontrado, etc)
 *   para que Stripe no reintente eternamente. Falla a 500 solo en errores
 *   de infra (BD caída) donde sí queremos reintentos.
 *
 * IMPORTANTE: este endpoint recibe el body como raw text. Stripe firma el body
 * original, si Next.js lo parsea como JSON la firma no coincide.
 */
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { notifyHeadSuccess, notifyProfessional } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" as any })
  : null;

export async function POST(req: NextRequest) {
  if (!stripe || !webhookSecret) {
    console.error("[stripe-webhook] Stripe not configured");
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

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

  console.log(`[stripe-webhook] Event: ${event.type} (id=${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
    return NextResponse.json({ received: true });
  } catch (err: any) {
    // Si llegamos aquí es un error inesperado (BD caída, etc). Devolvemos 500
    // para que Stripe reintente.
    console.error("[stripe-webhook] Handler error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// HANDLER: checkout.session.completed
// Pago confirmado → creamos Patient, marcamos Sale paid, notificamos a Miguel.
// ────────────────────────────────────────────────────────────────────────────
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const paymentToken = session.metadata?.paymentToken;
  if (!paymentToken) {
    console.warn("[stripe-webhook] checkout.completed sin metadata.paymentToken", { sessionId: session.id });
    return; // No reintentar: no podemos hacer nada sin token
  }

  // Buscar Sale + Lead
  const sale = await prisma.sale.findUnique({
    where: { paymentToken },
    include: { lead: true },
  });
  if (!sale) {
    console.warn("[stripe-webhook] Sale no encontrado", { paymentToken });
    return;
  }

  // IDEMPOTENCIA: si ya está paid, ya procesamos. Salimos OK.
  if (sale.status === "paid" && sale.patientId) {
    console.log("[stripe-webhook] Sale ya procesado, skipping", { saleId: sale.id });
    return;
  }

  // Anti-tampering: verificar que el amount coincide
  if (session.amount_total && session.amount_total !== sale.amountCents) {
    console.error("[stripe-webhook] AMOUNT MISMATCH", {
      saleId: sale.id,
      expected: sale.amountCents,
      received: session.amount_total,
    });
    // Aún así seguimos, pero loggeado para auditoría. Cambiar a `return` si
    // se prefiere bloquear.
  }

  // Calcular fechas del programa
  const now = new Date();
  const programEndDate = new Date(now);
  programEndDate.setMonth(programEndDate.getMonth() + sale.durationMonths);

  // Método de pago: viene en session.payment_method_types[0] o lo dejamos null
  const paymentMethod = Array.isArray(session.payment_method_types) && session.payment_method_types.length > 0
    ? session.payment_method_types[0]
    : null;

  // Transacción: Patient + Sale + Lead atómicos
  const result = await prisma.$transaction(async (tx) => {
    // Crear Patient heredando del Lead
    const patient = await tx.patient.create({
      data: {
        fullName: sale.lead.fullName,
        // El campo email del Lead es contactValue solo si contactType==="email"
        email: sale.lead.contactType === "email" ? sale.lead.contactValue : null,
        sport: "CrossFit",
        startedAt: now,
        subscriptionStartDate: now,
        subscriptionPeriodMonths: sale.durationMonths,
        subscriptionTotalMonths: sale.durationMonths,
        programType: sale.programType,
        programMode: "fixed",
        onboardingStatus: "pending_assignment",
        programDurationMonths: sale.durationMonths,
        programStartDate: now,
        programEndDate: programEndDate,
        onboardingTasks: { anamnesis: false, contract: false, firstSession: false },
      },
    });

    // Update Sale: paid + vincular patientId
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: "paid",
        paidAt: now,
        patientId: patient.id,
        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
        paymentMethod: paymentMethod,
      },
    });

    // Update Lead: marcar como won si no lo está ya
    if (sale.lead.status !== "won") {
      await tx.lead.update({
        where: { id: sale.leadId },
        data: { status: "won" },
      });
    }

    return patient;
  });

  console.log("[stripe-webhook] Patient creado", { patientId: result.id, saleId: sale.id });

  // Notificar a Miguel (head_success) — fuera de la transacción a propósito.
  // Si esto falla, el Patient ya está creado, no queremos rollback.
  try {
    await notifyHeadSuccess({
      type: "patient_new_unassigned",
      title: "Nuevo paciente sin asignar",
      body: `${sale.lead.fullName} ha pagado el programa ${sale.programType} de ${sale.durationMonths} meses. Asígnale fisio.`,
      actionUrl: `/pacientes/${result.id}`,
    });
  } catch (err) {
    console.error("[stripe-webhook] Error notificando a head_success:", err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// HANDLER: payment_intent.payment_failed
// Pago fallido → marcamos Sale failed, notificamos al closer que generó el link.
// ────────────────────────────────────────────────────────────────────────────
async function handlePaymentFailed(pi: Stripe.PaymentIntent) {
  const paymentToken = pi.metadata?.paymentToken;
  if (!paymentToken) {
    console.warn("[stripe-webhook] payment_failed sin metadata.paymentToken", { piId: pi.id });
    return;
  }

  const sale = await prisma.sale.findUnique({
    where: { paymentToken },
    include: { lead: true },
  });
  if (!sale) {
    console.warn("[stripe-webhook] Sale no encontrado para payment_failed", { paymentToken });
    return;
  }

  // Idempotencia: si ya está paid, no degradamos a failed
  if (sale.status === "paid") {
    console.log("[stripe-webhook] payment_failed ignorado: Sale ya paid", { saleId: sale.id });
    return;
  }

  await prisma.sale.update({
    where: { id: sale.id },
    data: { status: "failed" },
  });

  try {
    await notifyProfessional({
      professionalId: sale.closerId,
      type: "sale_payment_failed",
      title: "Pago fallido",
      body: `El intento de pago de ${sale.lead.fullName} ha fallado: ${pi.last_payment_error?.message || "sin detalles"}`,
    });
  } catch (err) {
    console.error("[stripe-webhook] Error notificando al closer:", err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// HANDLER: charge.refunded
// Reembolso → marcamos Sale refunded, notificamos a head_success.
// ────────────────────────────────────────────────────────────────────────────
async function handleChargeRefunded(charge: Stripe.Charge) {
  // El Sale lo localizamos por payment_intent
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) {
    console.warn("[stripe-webhook] refund sin payment_intent", { chargeId: charge.id });
    return;
  }

  const sale = await prisma.sale.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    include: { lead: true },
  });
  if (!sale) {
    console.warn("[stripe-webhook] Sale no encontrado para refund", { paymentIntentId });
    return;
  }

  if (sale.status === "refunded") {
    console.log("[stripe-webhook] Sale ya refunded, skipping", { saleId: sale.id });
    return;
  }

  await prisma.sale.update({
    where: { id: sale.id },
    data: { status: "refunded" },
  });

  try {
    await notifyHeadSuccess({
      type: "sale_refunded",
      title: "Reembolso procesado",
      body: `Se ha reembolsado ${(charge.amount_refunded / 100).toFixed(2)}€ del pago de ${sale.lead.fullName}.`,
      actionUrl: sale.patientId ? `/pacientes/${sale.patientId}` : undefined,
    });
  } catch (err) {
    console.error("[stripe-webhook] Error notificando refund:", err);
  }
}
