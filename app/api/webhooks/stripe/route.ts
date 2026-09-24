/**
 * POST /api/webhooks/stripe
 *
 * Webhook que escucha eventos de Stripe. Tras la migración a PayPal (Fase 4,
 * agosto 2026) este endpoint solo procesa el ciclo de vida de **Prevention**
 * (suscripción mensual/trimestral/anual en Stripe). Las altas RECUPERA/CONSOLIDA
 * y sus renovaciones ya no pasan por aquí — usan /api/webhooks/paypal.
 *
 * Eventos procesados:
 *   Prevention (suscripción Stripe):
 *   - checkout.session.completed (mode=subscription) → crea Patient +
 *     PatientSubscription + email de bienvenida (fallback si el usuario cerró
 *     la pestaña sin confirmar en /api/prevention/confirm).
 *   - customer.subscription.updated → sync periods/status.
 *   - customer.subscription.deleted → marca finished + email cancelación.
 *   - invoice.paid → refresca periods.
 *   - invoice.payment_failed → past_due + email para actualizar tarjeta.
 *
 * IMPORTANTE: este endpoint recibe el body como raw text. Stripe firma el body
 * original, si Next.js lo parsea como JSON la firma no coincide.
 */
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { isPreventionPlan } from "@/lib/stripe";
import { createPreventionSubscription, ensurePreventionRollingProgram } from "@/lib/prevention";
import { getOrCreatePatientAccessPath } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import {
  welcomeEmail,
  paymentFailedEmail,
  canceledEmail,
} from "@/lib/emails/prevention";
import { activateSaleAsPatient, applyRenewalCheckoutPaid } from "@/lib/paypal/activation";

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
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const productType = session.metadata?.productType;
        if (session.mode === "subscription" && productType === "prevention") {
          await handlePreventionCheckoutCompleted(session);
        } else if (productType === "sale") {
          await handleSaleCheckoutCompleted(session);
        } else if (productType === "renewal") {
          await handleRenewalCheckoutCompleted(session);
        } else {
          console.log("[stripe-webhook] checkout.session.completed ignorado", {
            sessionId: session.id,
            mode: session.mode,
            productType,
          });
        }
        break;
      }
      // Cuota mensual de una subscription (Sale o RenewalCheckout).
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        // Solo si es de una subscription con metadata productType
        const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (subId) {
          // Recuperar la subscription para su metadata
          const sub = await stripe.subscriptions.retrieve(subId);
          const meta = sub.metadata ?? {};
          if (meta.productType === "sale" || meta.productType === "renewal") {
            await handleSubscriptionInvoicePaid(invoice, sub, meta.productType as "sale" | "renewal");
            break;
          }
        }
        // Prevention u otros — fall-through al handler existente
        await handlePreventionInvoicePaid(invoice);
        break;
      }
      // ─── Prevention · ciclo de vida de la suscripción ────────────────
      case "customer.subscription.updated":
        await handlePreventionSubscriptionSync(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handlePreventionSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await handlePreventionInvoiceFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[stripe-webhook] Handler error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
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

  // Cerrar el ciclo comercial si el link vino de un closer (metadata.leadId).
  // Idempotente con /api/prevention/confirm — si ese endpoint ya marcó el
  // lead como won, este update es un no-op práctico (mismos campos).
  const leadIdFromMeta = typeof session.metadata?.leadId === "string" ? session.metadata.leadId : null;
  const closerIdFromMeta = typeof session.metadata?.closerId === "string" ? session.metadata.closerId : null;
  if (leadIdFromMeta) {
    await prisma.lead.update({
      where: { id: leadIdFromMeta },
      data: {
        status: "won",
        decidedAt: new Date(),
        // Vincula el Lead al Patient recien creado para que las metricas
        // del closer atribuyan la venta correctamente.
        convertedPatientId: patient.id,
        ...(closerIdFromMeta ? { closerId: closerIdFromMeta } : {}),
      },
    }).catch((err) => {
      console.error("[stripe-webhook] Error marcando lead como won:", err);
    });
  }

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

// ────────────────────────────────────────────────────────────────────────────
// SALE / RENEWAL HANDLERS (Stripe path, added 2026-09-24)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Al completar el checkout de un Sale (alta) por Stripe:
 *   - Guarda stripePaymentIntentId (mode=payment) o stripeSessionId.
 *   - Llama a activateSaleAsPatient() para crear Patient + SubscriptionRenewal
 *     + Transaction, con idempotencia end-to-end.
 */
async function handleSaleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const saleId = session.metadata?.saleId;
  if (!saleId) {
    console.warn("[stripe-webhook] sale checkout sin saleId en metadata", { sessionId: session.id });
    return;
  }
  // Guardar el PaymentIntent id para trazabilidad (mode=payment). Para
  // mode=subscription, guardamos el subscription id (viene en session.subscription).
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
  const stripeSubId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id ?? null;

  await prisma.sale.update({
    where: { id: saleId },
    data: {
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId ?? undefined,
      paymentMethod: stripeSubId ? "stripe_subscription" : "stripe",
    },
  }).catch((err) => console.warn("[stripe-webhook] Sale update trazabilidad falló:", err));

  // Activar Patient / SubscriptionRenewal / Transaction (idempotente).
  await activateSaleAsPatient({
    saleId,
    paymentMethod: stripeSubId ? "stripe_subscription" : "stripe",
    // Pasamos el subscription id como "paypalSubscriptionId" para reutilizar
    // el flag isSubscription — aunque el campo se llame "paypal", en Stripe
    // simplemente marca "hay una subscription en curso, no crees Transaction
    // aquí, deja que cada cuota (invoice.paid) la registre".
    paypalSubscriptionId: stripeSubId,
  });
}

/**
 * Al completar el checkout de una Renovación por Stripe.
 */
async function handleRenewalCheckoutCompleted(session: Stripe.Checkout.Session) {
  const checkoutId = session.metadata?.renewalCheckoutId;
  if (!checkoutId) {
    console.warn("[stripe-webhook] renewal checkout sin renewalCheckoutId", { sessionId: session.id });
    return;
  }
  const stripeSubId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id ?? null;
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  await prisma.renewalCheckout.update({
    where: { id: checkoutId },
    data: {
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId ?? undefined,
      paymentMethod: stripeSubId ? "stripe_subscription" : "stripe",
    },
  }).catch((err) => console.warn("[stripe-webhook] Renewal update trazabilidad falló:", err));

  await applyRenewalCheckoutPaid({
    checkoutId,
    paymentMethod: stripeSubId ? "stripe_subscription" : "stripe",
    // Igual que en sale: si hay subscription, marcamos isSubscription para
    // que las Transactions se creen por cuota, no aquí.
    isSubscription: !!stripeSubId,
  });
}

/**
 * Cada invoice.paid de una Stripe Subscription vinculada a Sale/RenewalCheckout
 * registra una Transaction income_new / income_renewal por cuota, con la
 * marca "cuota N/M" en description.
 */
async function handleSubscriptionInvoicePaid(
  invoice: Stripe.Invoice,
  sub: Stripe.Subscription,
  productType: "sale" | "renewal",
) {
  const amountValue = (invoice.amount_paid ?? 0) / 100;
  if (!amountValue) return;

  const totalCycles = Number(sub.metadata?.installments ?? 0) || 0;
  const paymentToken = sub.metadata?.paymentToken ?? null;

  if (productType === "sale") {
    const saleId = sub.metadata?.saleId ?? null;
    if (!saleId) return;
    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale || !sale.patientId) return;
    // Contar cuotas ya registradas para este paciente en este saleId
    const already = await prisma.transaction.count({
      where: {
        patientId: sale.patientId,
        type: "income_new",
        description: { contains: "cuota" },
      },
    });
    const cycleNumber = already + 1;
    await prisma.transaction.create({
      data: {
        type: "income_new",
        category: `${sale.programType} ${sale.durationMonths}M`,
        amount: amountValue,
        description: `Pago vía Stripe · ${sale.programType} ${sale.durationMonths} meses · cuota ${cycleNumber}/${totalCycles}`,
        occurredAt: new Date(),
        patientId: sale.patientId,
        professionalId: sale.closerId,
      },
    });
    // Cancelar la suscripción cuando llegue la última cuota (Stripe no
    // sabe cortar sola en N; lo hacemos aquí).
    if (totalCycles && cycleNumber >= totalCycles) {
      try {
        await (await import("stripe")).default;
        // Usamos el mismo cliente global
        const s: any = (globalThis as any).__stripe ?? new (await import("stripe")).default(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" as any });
        await s.subscriptions.cancel(sub.id);
      } catch (err) {
        console.error("[stripe-webhook] No pude cancelar sub tras última cuota:", err);
      }
    }
    return;
  }

  // productType === "renewal"
  const checkoutId = sub.metadata?.renewalCheckoutId ?? null;
  if (!checkoutId) return;
  const checkout = await prisma.renewalCheckout.findUnique({ where: { id: checkoutId } });
  if (!checkout || !checkout.patientId) return;

  const already = await prisma.transaction.count({
    where: {
      patientId: checkout.patientId,
      type: "income_renewal",
      description: { contains: "cuota" },
    },
  });
  const cycleNumber = already + 1;
  await prisma.transaction.create({
    data: {
      type: "income_renewal",
      category: `${checkout.programType} ${checkout.durationMonths}M`,
      amount: amountValue,
      description: `Renovación Stripe · ${checkout.programType} ${checkout.durationMonths} meses · cuota ${cycleNumber}/${totalCycles}`,
      occurredAt: new Date(),
      patientId: checkout.patientId,
      professionalId: checkout.createdById,
    },
  });
  if (totalCycles && cycleNumber >= totalCycles) {
    try {
      const s: any = (globalThis as any).__stripe ?? new (await import("stripe")).default(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" as any });
      await s.subscriptions.cancel(sub.id);
    } catch (err) {
      console.error("[stripe-webhook] No pude cancelar sub renewal tras última cuota:", err);
    }
  }
  // Ignorar paymentToken; solo era para trazabilidad
  void paymentToken;
}
