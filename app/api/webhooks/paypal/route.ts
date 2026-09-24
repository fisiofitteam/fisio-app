/**
 * POST /api/webhooks/paypal
 *
 * Webhook que escucha eventos de PayPal (Orders + Captures + Subscriptions).
 * Espejo del de Stripe, adaptado al modelo REST de PayPal.
 *
 * Eventos procesados:
 *   Fase 1 (pago único):
 *     - PAYMENT.CAPTURE.COMPLETED → crea Patient, marca Sale paid.
 *     - PAYMENT.CAPTURE.DENIED   → marca Sale failed.
 *     - PAYMENT.CAPTURE.REFUNDED → marca Sale refunded, notifica.
 *
 *   Fase 2 (suscripción N ciclos):
 *     - BILLING.SUBSCRIPTION.ACTIVATED       → crea Patient (misma lógica que
 *       capture.completed pero por importe total pactado).
 *     - PAYMENT.SALE.COMPLETED               → informativo. Registra el
 *       cobro mensual como transaction income_new proporcional a la cuota.
 *     - BILLING.SUBSCRIPTION.CANCELLED       → notifica al equipo.
 *     - BILLING.SUBSCRIPTION.PAYMENT.FAILED  → notifica al equipo.
 *
 * Diseño:
 *  - IDEMPOTENTE: si el Sale ya está paid con patientId, saltamos.
 *  - Firma verificada contra el endpoint de PayPal (ver lib/paypal/webhook).
 *  - 200 OK en errores de negocio (Sale no encontrado, sin custom_id, …).
 *    500 solo en fallos de infraestructura (BD caída, PayPal caído…).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyHeadSuccess } from "@/lib/notifications";
import { verifyWebhookSignature } from "@/lib/paypal/webhook";
import { paypalCredentials } from "@/lib/paypal/config";
// activateSaleAsPatient y applyRenewalCheckoutPaid viven en lib/paypal/activation.ts
// para que también las usen los status endpoints y el reconciliador admin.
// Antes duplicaban el código aquí y el bug era catastrófico: si el webhook
// no llegaba, ninguna otra vía podía completar la activación.
import { activateSaleAsPatient, applyRenewalCheckoutPaid } from "@/lib/paypal/activation";

// Prefijo del custom_id de PayPal para diferenciar renovaciones (RenewalCheckout)
// de altas (Sale). Ver /api/renewal/[token]/paypal.
const RENEWAL_CUSTOM_ID_PREFIX = "renewal:";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!paypalCredentials()) {
    console.error("[paypal-webhook] PayPal no configurado");
    return NextResponse.json({ error: "PayPal not configured" }, { status: 500 });
  }

  const raw = await req.text();
  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const verify = await verifyWebhookSignature({ headers: req.headers, event });
  if (!verify.ok) {
    console.error("[paypal-webhook] Firma inválida:", verify.reason);
    return NextResponse.json({ error: "Invalid signature", reason: verify.reason }, { status: 400 });
  }

  console.log(`[paypal-webhook] Event: ${event.event_type} (id=${event.id})`);

  try {
    switch (event.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED":
        await handleCaptureCompleted(event.resource);
        break;
      case "PAYMENT.CAPTURE.DENIED":
        await handleCaptureDenied(event.resource);
        break;
      case "PAYMENT.CAPTURE.REFUNDED":
      case "PAYMENT.CAPTURE.REVERSED":
        await handleCaptureRefunded(event.resource);
        break;
      case "CHECKOUT.ORDER.APPROVED":
        console.log("[paypal-webhook] Order aprobada (sin acción)", { orderId: event.resource?.id });
        break;

      // ─── Fase 2 · Subscriptions ────────────────────────────────────────
      case "BILLING.SUBSCRIPTION.ACTIVATED":
        await handleSubscriptionActivated(event.resource);
        break;
      case "PAYMENT.SALE.COMPLETED":
        await handleSubscriptionCyclePayment(event.resource);
        break;
      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.EXPIRED":
      case "BILLING.SUBSCRIPTION.SUSPENDED":
        await handleSubscriptionEnded(event.resource, event.event_type);
        break;
      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
        await handleSubscriptionPaymentFailed(event.resource);
        break;

      default:
        console.log(`[paypal-webhook] Unhandled event type: ${event.event_type}`);
    }
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[paypal-webhook] Error inesperado, devolviendo 500 para reintento:", err);
    return NextResponse.json({ error: err?.message ?? "internal" }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PAYMENT.CAPTURE.COMPLETED — Order de pago único
// ────────────────────────────────────────────────────────────────────────────
async function handleCaptureCompleted(capture: any) {
  const rawCustomId: string | undefined =
    capture?.custom_id ?? capture?.supplementary_data?.related_ids?.custom_id;
  if (!rawCustomId) {
    console.warn("[paypal-webhook] capture.completed sin custom_id", { captureId: capture?.id });
    return;
  }
  // Renovación: custom_id = "renewal:<paymentToken>" → aplica renewal helper
  if (rawCustomId.startsWith(RENEWAL_CUSTOM_ID_PREFIX)) {
    const token = rawCustomId.slice(RENEWAL_CUSTOM_ID_PREFIX.length);
    await handleRenewalCaptureCompleted(token, capture);
    return;
  }
  const paymentToken = rawCustomId;
  const sale = await prisma.sale.findUnique({ where: { paymentToken } });
  if (!sale) {
    console.warn("[paypal-webhook] Sale no encontrado", { paymentToken });
    return;
  }

  // Anti-tampering: verificar que el amount coincide.
  const amountValue = Number(capture?.amount?.value ?? 0);
  const receivedCents = Math.round(amountValue * 100);
  if (receivedCents && receivedCents !== sale.amountCents) {
    console.error("[paypal-webhook] AMOUNT MISMATCH", {
      saleId: sale.id,
      expected: sale.amountCents,
      received: receivedCents,
    });
  }

  const isPayLater = detectIsPayLater(capture);
  const paymentMethod = isPayLater ? "paypal_paylater" : "paypal";

  await activateSaleAsPatient({
    saleId: sale.id,
    paymentMethod,
    paypalCaptureId: capture?.id ?? null,
    notifyTitle: "Nuevo paciente sin asignar",
    notifyBody: `{{fullName}} ha pagado el programa ${sale.programType} de ${sale.durationMonths} meses (PayPal${isPayLater ? " · fraccionado" : ""}). Asígnale fisio.`,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// BILLING.SUBSCRIPTION.ACTIVATED — cliente aprobó la suscripción N ciclos
// ────────────────────────────────────────────────────────────────────────────
async function handleSubscriptionActivated(subscription: any) {
  const rawCustomId: string | undefined = subscription?.custom_id;
  if (!rawCustomId) {
    console.warn("[paypal-webhook] subscription.activated sin custom_id", { subId: subscription?.id });
    return;
  }
  // Renovación: custom_id = "renewal:<paymentToken>"
  if (rawCustomId.startsWith(RENEWAL_CUSTOM_ID_PREFIX)) {
    const token = rawCustomId.slice(RENEWAL_CUSTOM_ID_PREFIX.length);
    await handleRenewalSubscriptionActivated(token, subscription);
    return;
  }
  const paymentToken = rawCustomId;
  const sale = await prisma.sale.findUnique({ where: { paymentToken } });
  if (!sale) {
    console.warn("[paypal-webhook] Sale no encontrado para subscription", { paymentToken });
    return;
  }
  const installments = sale.installmentCount ?? 0;
  await activateSaleAsPatient({
    saleId: sale.id,
    paymentMethod: "paypal_subscription",
    paypalSubscriptionId: subscription?.id ?? sale.paypalSubscriptionId,
    notifyTitle: "Nuevo paciente sin asignar",
    notifyBody: `{{fullName}} ha activado el programa ${sale.programType} de ${sale.durationMonths} meses (PayPal · ${installments} cuotas mensuales). Asígnale fisio.`,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// PAYMENT.SALE.COMPLETED — cobro periódico de una suscripción (cuota 2..N)
// ────────────────────────────────────────────────────────────────────────────
async function handleSubscriptionCyclePayment(sale: any) {
  // sale.billing_agreement_id = subscription id (PayPal legacy naming)
  const subscriptionId: string | undefined = sale?.billing_agreement_id;
  if (!subscriptionId) return;

  const amountValue = Number(sale?.amount?.total ?? 0);
  if (!amountValue) return;

  // Buscar primero como Sale (alta), después como RenewalCheckout (renovación)
  const saleRecord = await prisma.sale.findUnique({
    where: { paypalSubscriptionId: subscriptionId },
  });
  if (saleRecord && saleRecord.patientId) {
    await registerSubscriptionCycle({
      patientId: saleRecord.patientId,
      programType: saleRecord.programType,
      durationMonths: saleRecord.durationMonths,
      totalCycles: saleRecord.installmentCount ?? 0,
      amountValue,
      professionalId: saleRecord.closerId,
      transactionType: "income_new",
      subscriptionId,
    });
    return;
  }

  const renewalCheckout = await prisma.renewalCheckout.findUnique({
    where: { paypalSubscriptionId: subscriptionId },
  });
  if (renewalCheckout && renewalCheckout.patientId) {
    await registerSubscriptionCycle({
      patientId: renewalCheckout.patientId,
      programType: renewalCheckout.programType,
      durationMonths: renewalCheckout.durationMonths,
      totalCycles: renewalCheckout.installmentCount ?? 0,
      amountValue,
      professionalId: renewalCheckout.createdById,
      transactionType: "income_renewal",
      subscriptionId,
    });
    return;
  }

  console.warn("[paypal-webhook] sale.completed sin sale/renewal asociado", { subscriptionId });
}

/**
 * Registra una cuota mensual como Transaction. Cuenta las ya registradas para
 * ese paciente con la etiqueta "cuota" y crea una nueva cada vez que llega
 * PAYMENT.SALE.COMPLETED. Esto incluye la PRIMERA cuota — antes se creaba
 * en subscription.activated, ahora es responsabilidad única de este handler
 * para evitar el duplicado.
 */
async function registerSubscriptionCycle(opts: {
  patientId: string;
  programType: string;
  durationMonths: number;
  totalCycles: number;
  amountValue: number;
  professionalId: string | null;
  transactionType: "income_new" | "income_renewal";
  subscriptionId: string;
}) {
  // Contamos las cuotas ya registradas para ESTE paciente por PayPal (marca
  // "cuota" en descripción). Así calculamos el número de cuota actual.
  const alreadyBilled = await prisma.transaction.count({
    where: {
      patientId: opts.patientId,
      type: opts.transactionType,
      description: { contains: "cuota" },
    },
  });
  const cycleNumber = alreadyBilled + 1;
  const label = opts.transactionType === "income_renewal" ? "Renovación PayPal" : "Pago vía PayPal";
  await prisma.transaction.create({
    data: {
      type: opts.transactionType,
      category: `${opts.programType} ${opts.durationMonths}M`,
      amount: opts.amountValue,
      description: `${label} · ${opts.programType} ${opts.durationMonths} meses · cuota ${cycleNumber}/${opts.totalCycles}`,
      occurredAt: new Date(),
      patientId: opts.patientId,
      professionalId: opts.professionalId,
    },
  });
  console.log("[paypal-webhook] Cuota registrada", {
    subscriptionId: opts.subscriptionId,
    cycleNumber,
    totalCycles: opts.totalCycles,
    amount: opts.amountValue,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// BILLING.SUBSCRIPTION.CANCELLED/EXPIRED/SUSPENDED — informar al equipo
// ────────────────────────────────────────────────────────────────────────────
async function handleSubscriptionEnded(subscription: any, eventType: string) {
  const subscriptionId: string | undefined = subscription?.id;
  if (!subscriptionId) return;
  const sale = await prisma.sale.findUnique({
    where: { paypalSubscriptionId: subscriptionId },
    include: { lead: true },
  });
  if (!sale) return;
  const suffix = eventType.split(".").pop()?.toLowerCase() ?? "ended";
  console.log("[paypal-webhook] Subscription", suffix, { subscriptionId, saleId: sale.id });
  try {
    await notifyHeadSuccess({
      type: "subscription_ended",
      title: `Suscripción PayPal ${suffix}`,
      body: `La suscripción de ${sale.lead.fullName} (${sale.programType}) está en estado ${suffix}. Revísalo.`,
      actionUrl: sale.patientId ? `/fisio/paciente/${sale.patientId}/ficha` : `/fisio/finanzas`,
    });
  } catch (err) {
    console.error("[paypal-webhook] Error notificando fin de suscripción:", err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// BILLING.SUBSCRIPTION.PAYMENT.FAILED — cuota no cobrada
// ────────────────────────────────────────────────────────────────────────────
async function handleSubscriptionPaymentFailed(subscription: any) {
  const subscriptionId: string | undefined = subscription?.id;
  if (!subscriptionId) return;
  const sale = await prisma.sale.findUnique({
    where: { paypalSubscriptionId: subscriptionId },
    include: { lead: true },
  });
  if (!sale) return;
  try {
    await notifyHeadSuccess({
      type: "subscription_payment_failed",
      title: "Cobro PayPal fallido",
      body: `PayPal no ha podido cobrar una cuota de ${sale.lead.fullName} (${sale.programType}). Contacta con el cliente.`,
      actionUrl: sale.patientId ? `/fisio/paciente/${sale.patientId}/ficha` : `/fisio/finanzas`,
    });
  } catch (err) {
    console.error("[paypal-webhook] Error notificando fallo cobro:", err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PAYMENT.CAPTURE.DENIED — pago fallido
// ────────────────────────────────────────────────────────────────────────────
async function handleCaptureDenied(capture: any) {
  const paymentToken: string | undefined = capture?.custom_id;
  if (!paymentToken) {
    console.warn("[paypal-webhook] capture.denied sin custom_id");
    return;
  }
  const sale = await prisma.sale.findUnique({ where: { paymentToken } });
  if (!sale || sale.status === "paid") return;
  await prisma.sale.update({
    where: { id: sale.id },
    data: { status: "failed" },
  });
  console.log("[paypal-webhook] Sale marcado failed", { saleId: sale.id });
}

// ────────────────────────────────────────────────────────────────────────────
// PAYMENT.CAPTURE.REFUNDED / REVERSED — reembolso
// ────────────────────────────────────────────────────────────────────────────
async function handleCaptureRefunded(refund: any) {
  const captureId = refund?.links?.find((l: any) => l.rel === "up")?.href?.split("/").pop();
  const paymentToken: string | undefined = refund?.custom_id;

  const sale = paymentToken
    ? await prisma.sale.findUnique({ where: { paymentToken } })
    : captureId
      ? await prisma.sale.findFirst({ where: { paypalCaptureId: captureId } })
      : null;
  if (!sale) {
    console.warn("[paypal-webhook] Refund sin Sale asociado", { captureId, paymentToken });
    return;
  }
  if (sale.status === "refunded") return;
  await prisma.sale.update({
    where: { id: sale.id },
    data: { status: "refunded" },
  });
  console.log("[paypal-webhook] Sale marcado refunded", { saleId: sale.id });

  try {
    await notifyHeadSuccess({
      type: "sale_refunded",
      title: "Reembolso PayPal",
      body: `Se ha reembolsado un pago (Sale ${sale.id}). Revisa la incidencia.`,
      actionUrl: `/fisio/finanzas`,
    });
  } catch (err) {
    console.error("[paypal-webhook] Error notificando refund:", err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// RENOVACIONES · aplican cuando custom_id = "renewal:<paymentToken>"
// ════════════════════════════════════════════════════════════════════════════

/** Renovación pagada de una sola vez (Order capture). */
async function handleRenewalCaptureCompleted(paymentToken: string, capture: any) {
  const checkout = await prisma.renewalCheckout.findUnique({
    where: { paymentToken },
  });
  if (!checkout) {
    console.warn("[paypal-webhook] RenewalCheckout no encontrado", { paymentToken });
    return;
  }
  // Anti-tampering: verificar amount
  const amountValue = Number(capture?.amount?.value ?? 0);
  const receivedCents = Math.round(amountValue * 100);
  if (receivedCents && receivedCents !== checkout.amountCents) {
    console.error("[paypal-webhook] RENEWAL AMOUNT MISMATCH", {
      checkoutId: checkout.id,
      expected: checkout.amountCents,
      received: receivedCents,
    });
  }
  const isPayLater = detectIsPayLater(capture);
  await applyRenewalCheckoutPaid({
    checkoutId: checkout.id,
    paymentMethod: isPayLater ? "paypal_paylater" : "paypal",
    paypalCaptureId: capture?.id ?? null,
    isSubscription: false,
  });
}

/** Renovación con suscripción de N cuotas activada. */
async function handleRenewalSubscriptionActivated(paymentToken: string, subscription: any) {
  const checkout = await prisma.renewalCheckout.findUnique({
    where: { paymentToken },
  });
  if (!checkout) {
    console.warn("[paypal-webhook] RenewalCheckout no encontrado (sub)", { paymentToken });
    return;
  }
  await applyRenewalCheckoutPaid({
    checkoutId: checkout.id,
    paymentMethod: "paypal_subscription",
    paypalSubscriptionId: subscription?.id ?? checkout.paypalSubscriptionId,
    isSubscription: true,
  });
}

/**
 * Heurística para detectar si el pago fue con "Pay in 3/4" de PayPal (BNPL).
 */
function detectIsPayLater(capture: any): boolean {
  const blob = JSON.stringify(capture ?? {}).toLowerCase();
  return blob.includes("paylater") || blob.includes("pay_later") || blob.includes("pay_upon_invoice");
}
