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
import { applyRenewal } from "@/lib/renewals";
import { isPreventionPlan } from "@/lib/stripe";
import { createPreventionSubscription, ensurePreventionRollingProgram } from "@/lib/prevention";
import { getOrCreatePatientAccessPath } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import {
  welcomeEmail,
  paymentFailedEmail,
  canceledEmail,
} from "@/lib/emails/prevention";

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
      // ─── Prevention · ciclo de vida de la suscripción ────────────────
      case "customer.subscription.updated":
        await handlePreventionSubscriptionSync(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handlePreventionSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid":
        await handlePreventionInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handlePreventionInvoiceFailed(event.data.object as Stripe.Invoice);
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
// HANDLER: renovación pagada (kind=renewal)
// Paciente existente → creamos el SubscriptionRenewal y marcamos el checkout.
// ────────────────────────────────────────────────────────────────────────────
async function handleRenewalCompleted(session: Stripe.Checkout.Session) {
  const paymentToken = session.metadata?.paymentToken;
  if (!paymentToken) {
    console.warn("[stripe-webhook] renewal sin metadata.paymentToken", { sessionId: session.id });
    return;
  }

  const checkout = await prisma.renewalCheckout.findUnique({ where: { paymentToken } });
  if (!checkout) {
    console.warn("[stripe-webhook] RenewalCheckout no encontrado", { paymentToken });
    return;
  }

  // IDEMPOTENCIA: si ya está pagado y tiene renovación creada, salimos OK.
  if (checkout.status === "paid" && checkout.renewalId) {
    console.log("[stripe-webhook] Renovación ya procesada, skipping", { id: checkout.id });
    return;
  }

  if (session.amount_total && session.amount_total !== checkout.amountCents) {
    console.error("[stripe-webhook] RENEWAL AMOUNT MISMATCH", {
      id: checkout.id,
      expected: checkout.amountCents,
      received: session.amount_total,
    });
  }

  const paymentMethod = Array.isArray(session.payment_method_types) && session.payment_method_types.length > 0
    ? session.payment_method_types[0]
    : null;

  const { renewalId, status } = await applyRenewal({
    patientId: checkout.patientId,
    programType: checkout.programType,
    periodMonths: checkout.durationMonths,
    amountPaid: checkout.amountCents / 100,
    professionalId: checkout.createdById,
    notes: "Renovación (pago Stripe)",
  });

  await prisma.renewalCheckout.update({
    where: { id: checkout.id },
    data: {
      status: "paid",
      paidAt: new Date(),
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      paymentMethod,
      renewalId,
    },
  });

  console.log("[stripe-webhook] Renovación aplicada", { id: checkout.id, renewalId, status });
}

// ────────────────────────────────────────────────────────────────────────────
// HANDLER: checkout.session.completed
// Pago confirmado → creamos Patient, marcamos Sale paid, notificamos a Miguel.
// ────────────────────────────────────────────────────────────────────────────
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Prevention: subscription mode. La página /prevention/gracias hace el
  // sync síncrono con /api/prevention/confirm, pero este webhook es la red
  // de seguridad si el usuario no vuelve al gracias (cerró la pestaña).
  if (session.mode === "subscription" && session.metadata?.productType === "prevention") {
    await handlePreventionCheckoutCompleted(session);
    return;
  }

  // Renovaciones: flujo aparte (paciente existente, sin crear cuenta).
  if (session.metadata?.kind === "renewal") {
    await handleRenewalCompleted(session);
    return;
  }

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

  // Datos extra que vienen del modal "Nuevo paciente" cuando el Sale se
  // generó como alta manual (assignedProfessionalId, diagnosis...). Si el
  // Sale viene de la agenda de leads, este campo es null y nada cambia.
  let manualAlta: {
    assignedProfessionalId?: string;
    diagnosis?: string;
  } = {};
  if (sale.manualAltaData) {
    try {
      const parsed = JSON.parse(sale.manualAltaData);
      if (parsed && typeof parsed === "object") manualAlta = parsed;
    } catch (e) {
      console.warn("[stripe-webhook] manualAltaData JSON inválido", { saleId: sale.id });
    }
  }

  // Transacción: Patient + Sale + Lead atómicos
  const result = await prisma.$transaction(async (tx) => {
    // Crear Patient heredando del Lead
    // Email: si contactType es email, lo cogemos del contactValue. Si no, del
    // campo email del Lead (que puede haberlo guardado el setter aparte).
    const leadEmailRaw = sale.lead.contactType === "email"
      ? sale.lead.contactValue
      : sale.lead.email;
    const leadPhoneRaw = sale.lead.contactType === "phone"
      ? sale.lead.contactValue
      : sale.lead.phone;
    const patient = await tx.patient.create({
      data: {
        fullName: sale.lead.fullName,
        email: leadEmailRaw ? leadEmailRaw.trim().toLowerCase() : null,
        phone: leadPhoneRaw?.trim() || null,
        instagram: sale.lead.instagram?.trim().replace(/^@+/, "") || null,
        sport: "CrossFit",
        startedAt: now,
        subscriptionStartDate: now,
        subscriptionPeriodMonths: sale.durationMonths,
        subscriptionTotalMonths: sale.durationMonths,
        programType: sale.programType,
        programMode: "fixed",
        // Si el alta es manual y el CEO eligió fisio, pasa directo a
        // "active" (saltamos el paso de asignación). Si no, queda en
        // "pending_assignment" como siempre.
        onboardingStatus: manualAlta.assignedProfessionalId
          ? "active"
          : "pending_assignment",
        ...(manualAlta.assignedProfessionalId
          ? { assignedProfessionalId: manualAlta.assignedProfessionalId }
          : {}),
        ...(manualAlta.diagnosis
          ? { diagnosis: manualAlta.diagnosis }
          : {}),
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

    // Crear Transaction de ingreso por nueva alta
    // Importe en euros (Transaction.amount es Float en €, Sale.amountCents en céntimos)
    await tx.transaction.create({
      data: {
        type: "income_new",
        category: `${sale.programType} ${sale.durationMonths}M`,
        amount: sale.amountCents / 100,
        description: `Pago vía Stripe · ${sale.programType} ${sale.durationMonths} meses · ${paymentMethod || "card"}`,
        occurredAt: now,
        patientId: patient.id,
        professionalId: sale.closerId,
      },
    });

    // Crear SubscriptionRenewal inicial (es el "Periodo 1" que verá Miguel en la pestaña Suscripción)
    // En futuras renovaciones se crea uno nuevo desde el panel, no automáticamente
    await tx.subscriptionRenewal.create({
      data: {
        patientId: patient.id,
        programType: sale.programType,
        periodMonths: sale.durationMonths,
        startDate: patient.programStartDate ?? now,
        endDate: patient.programEndDate ?? new Date(now.getTime() + sale.durationMonths * 30 * 86400000),
        status: "active",
        amountPaid: sale.amountCents / 100,
        decidedAt: now,
        notes: "Alta inicial (pago Stripe)",
      },
    });

    // Update Lead: marcar como won + decidedAt + vincular el paciente creado.
    // convertedPatientId es CLAVE para que las métricas y la lista del panel del
    // closer encuentren el paciente y sus transacciones (income_new).
    const leadUpdate: any = { convertedPatientId: patient.id };
    if (sale.lead.status !== "won") {
      leadUpdate.status = "won";
      leadUpdate.decidedAt = now;
    } else if (!sale.lead.decidedAt) {
      leadUpdate.decidedAt = now;
    }
    await tx.lead.update({
      where: { id: sale.leadId },
      data: leadUpdate,
    });

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
      actionUrl: `/fisio/paciente/${result.id}/ficha`,
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
      actionUrl: sale.patientId ? `/fisio/paciente/${sale.patientId}/ficha` : undefined,
    });
  } catch (err) {
    console.error("[stripe-webhook] Error notificando refund:", err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PREVENTION HANDLERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fallback del /api/prevention/confirm cuando el paciente cerró la pestaña
 * de gracias sin dar tiempo al sync síncrono. Crea Patient + subscription
 * de forma idempotente y manda el email de bienvenida.
 */
async function handlePreventionCheckoutCompleted(session: Stripe.Checkout.Session) {
  const stripeSubId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id;
  if (!stripeSubId) {
    console.warn("[stripe-webhook] Prevention checkout sin subscription id", { sessionId: session.id });
    return;
  }

  // Si ya existe (confirm ya la creó), salimos.
  const existing = await prisma.patientSubscription.findUnique({
    where: { stripeSubscriptionId: stripeSubId },
    include: { patient: true },
  });
  if (existing) {
    console.log("[stripe-webhook] Prevention subscription ya existe, skip", { subId: existing.id });
    return;
  }

  const plan = session.metadata?.plan;
  if (!isPreventionPlan(plan)) {
    console.warn("[stripe-webhook] Prevention checkout con plan inválido", { plan });
    return;
  }
  const fullName = (session.metadata?.fullName ?? "").toString().trim();
  const phoneFromMeta = (session.metadata?.phone ?? "").toString().trim();
  const email = (session.customer_details?.email ?? session.customer_email ?? "").toString().trim().toLowerCase();
  if (!email) {
    console.warn("[stripe-webhook] Prevention checkout sin email", { sessionId: session.id });
    return;
  }

  // Localizar o crear Patient
  let patient = await prisma.patient.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  const isNewPatient = !patient;
  if (!patient) {
    patient = await prisma.patient.create({
      data: {
        fullName: fullName || email.split("@")[0],
        email,
        phone: phoneFromMeta || null,
        programType: "PREVENTION",
        programMode: "rolling",
        subscriptionPeriodMonths: 0,
        subscriptionTotalMonths: 0,
        // Prevention no pasa por onboarding: sin anamnesis ni contrato.
        onboardingTasks: undefined,
      },
    });
  } else if (phoneFromMeta && !patient.phone) {
    // Paciente existente sin phone → aprovechamos el checkout para rellenarlo.
    patient = await prisma.patient.update({
      where: { id: patient.id },
      data: { phone: phoneFromMeta },
    });
  }

  const stripeCustomerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id;

  // Enlazar al primer Rolling Prevention activo (idempotente).
  await ensurePreventionRollingProgram(patient.id);

  const sub = await createPreventionSubscription({
    patientId: patient.id,
    plan,
    stripeSubscriptionId: stripeSubId,
    stripeCustomerId: stripeCustomerId ?? null,
    stripePriceId: null,
    originSource: "landing",
  });

  // Sync los datos frescos de Stripe una vez creada la fila local
  await handlePreventionSubscriptionSync({ id: stripeSubId } as Stripe.Subscription);

  // Email de bienvenida con magic link 1-clic (más fiable que depender del
  // código secundario si el paciente cambia de dispositivo).
  try {
    const first = patient.fullName.split(" ")[0];
    const { path: accessPath } = await getOrCreatePatientAccessPath(patient.id);
    const mail = welcomeEmail({
      firstName: first,
      plan,
      patientId: patient.id,
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      scheduledStartAt: sub.scheduledStartAt?.toISOString() ?? null,
      accessPath,
    });
    await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    console.error("[stripe-webhook] Error mandando welcome email:", err);
  }

  console.log("[stripe-webhook] Prevention subscription creada via webhook", {
    patientId: patient.id,
    subId: sub.id,
    isNewPatient,
  });
}

/**
 * Sincroniza el estado local de PatientSubscription con Stripe.
 * Llamado por customer.subscription.updated / invoice.paid y también
 * al final de handlePreventionCheckoutCompleted para refrescar periods.
 */
async function handlePreventionSubscriptionSync(subInput: Stripe.Subscription) {
  if (!stripe) return;
  const subId = subInput.id;
  const local = await prisma.patientSubscription.findUnique({
    where: { stripeSubscriptionId: subId },
  });
  if (!local) {
    console.log("[stripe-webhook] Sync sub sin fila local (aún no la hemos creado)", { subId });
    return;
  }

  const remote = await stripe.subscriptions.retrieve(subId);
  const statusMap: Record<string, string> = {
    trialing: "trialing",
    active: "active",
    past_due: "past_due",
    unpaid: "unpaid",
    canceled: "canceled",
    incomplete: "trialing",
    incomplete_expired: "canceled",
    paused: "canceled",
  };
  const localStatus = statusMap[remote.status] ?? remote.status;
  // Respetamos "scheduled" hasta que la activación por cron o el primer periodo
  // active ocurran. Stripe no sabe de scheduled — es nuestro flag interno.
  const finalStatus = local.status === "scheduled" && !["active", "past_due"].includes(localStatus)
    ? "scheduled"
    : localStatus;

  await prisma.patientSubscription.update({
    where: { id: local.id },
    data: {
      status: finalStatus,
      currentPeriodStart: remote.current_period_start
        ? new Date(remote.current_period_start * 1000)
        : local.currentPeriodStart,
      currentPeriodEnd: remote.current_period_end
        ? new Date(remote.current_period_end * 1000)
        : local.currentPeriodEnd,
      trialEndsAt: remote.trial_end ? new Date(remote.trial_end * 1000) : local.trialEndsAt,
      cancelAtPeriodEnd: remote.cancel_at_period_end ?? local.cancelAtPeriodEnd,
      canceledAt: remote.canceled_at ? new Date(remote.canceled_at * 1000) : local.canceledAt,
      stripePriceId: remote.items?.data?.[0]?.price?.id ?? local.stripePriceId,
      stripeCustomerId: (typeof remote.customer === "string" ? remote.customer : remote.customer?.id) ?? local.stripeCustomerId,
    },
  });
}

async function handlePreventionSubscriptionDeleted(sub: Stripe.Subscription) {
  const local = await prisma.patientSubscription.findUnique({
    where: { stripeSubscriptionId: sub.id },
    include: { patient: true },
  });
  if (!local) return;

  await prisma.patientSubscription.update({
    where: { id: local.id },
    data: {
      status: "finished",
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : new Date(),
      cancelAtPeriodEnd: false,
    },
  });

  // Cuando Prevention termina, devolvemos el Patient a un estado "sin
  // programa" para que otro producto pueda tomarlo. Si el paciente sigue
  // teniendo otro programType (RECUPERA/CONSOLIDA/ADVANCE), no lo tocamos.
  if (local.patient.programType === "PREVENTION") {
    await prisma.patient.update({
      where: { id: local.patient.id },
      data: { programType: null },
    });
  }

  // Email de cancelación
  try {
    if (local.patient.email && local.currentPeriodEnd) {
      const first = local.patient.fullName.split(" ")[0];
      const mail = canceledEmail({
        firstName: first,
        endDate: local.currentPeriodEnd.toISOString(),
      });
      await sendEmail({ to: local.patient.email, subject: mail.subject, html: mail.html, text: mail.text });
    }
  } catch (err) {
    console.error("[stripe-webhook] Error mandando canceled email:", err);
  }
}

/**
 * Un ciclo de la suscripción se ha pagado con éxito. Refrescamos periods
 * en local — el email de bienvenida ya se mandó en el checkout inicial y
 * el email de renewalSoon lo manda el cron 7 días antes.
 */
async function handlePreventionInvoicePaid(invoice: Stripe.Invoice) {
  const subId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id;
  if (!subId) return;
  await handlePreventionSubscriptionSync({ id: subId } as Stripe.Subscription);
}

/**
 * Un cobro ha fallado. Marca past_due y envía email para actualizar el
 * método de pago.
 */
async function handlePreventionInvoiceFailed(invoice: Stripe.Invoice) {
  const subId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id;
  if (!subId) return;
  const local = await prisma.patientSubscription.findUnique({
    where: { stripeSubscriptionId: subId },
    include: { patient: true },
  });
  if (!local) return;

  await prisma.patientSubscription.update({
    where: { id: local.id },
    data: { status: "past_due" },
  });

  try {
    if (local.patient.email) {
      const first = local.patient.fullName.split(" ")[0];
      const mail = paymentFailedEmail({ firstName: first, patientId: local.patient.id });
      await sendEmail({ to: local.patient.email, subject: mail.subject, html: mail.html, text: mail.text });
    }
  } catch (err) {
    console.error("[stripe-webhook] Error mandando payment_failed email:", err);
  }
}

