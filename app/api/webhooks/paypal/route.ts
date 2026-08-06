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
// Alta de paciente (compartida entre Order.capture.completed y
// Subscription.activated). Idempotente vía Sale.status.
// ────────────────────────────────────────────────────────────────────────────
async function activateSaleAsPatient(input: {
  saleId: string;
  paymentMethod: string;
  paypalCaptureId?: string | null;
  paypalSubscriptionId?: string | null;
  amountVerified?: boolean;
  notifyTitle: string;
  notifyBody: string;
}) {
  const sale = await prisma.sale.findUnique({
    where: { id: input.saleId },
    include: { lead: true },
  });
  if (!sale) return;
  if (sale.status === "paid" && sale.patientId) {
    console.log("[paypal-webhook] Sale ya procesado, skipping", { saleId: sale.id });
    return;
  }

  const now = new Date();
  const programEndDate = new Date(now);
  programEndDate.setMonth(programEndDate.getMonth() + sale.durationMonths);

  let manualAlta: { assignedProfessionalId?: string; diagnosis?: string } = {};
  if ((sale as any).manualAltaData) {
    try {
      const parsed = JSON.parse((sale as any).manualAltaData);
      if (parsed && typeof parsed === "object") manualAlta = parsed;
    } catch {
      console.warn("[paypal-webhook] manualAltaData JSON inválido", { saleId: sale.id });
    }
  }

  const patient = await prisma.$transaction(async (tx) => {
    const leadEmailRaw =
      sale.lead.contactType === "email" ? sale.lead.contactValue : sale.lead.email;
    const leadPhoneRaw =
      sale.lead.contactType === "phone" ? sale.lead.contactValue : sale.lead.phone;
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
        onboardingStatus: manualAlta.assignedProfessionalId ? "active" : "pending_assignment",
        ...(manualAlta.assignedProfessionalId
          ? { assignedProfessionalId: manualAlta.assignedProfessionalId }
          : {}),
        ...(manualAlta.diagnosis ? { diagnosis: manualAlta.diagnosis } : {}),
        programDurationMonths: sale.durationMonths,
        programStartDate: now,
        programEndDate,
        onboardingTasks: { anamnesis: false, contract: false, firstSession: false } as any,
      },
    });

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: "paid",
        paidAt: now,
        patientId: patient.id,
        paypalCaptureId: input.paypalCaptureId ?? sale.paypalCaptureId,
        paypalSubscriptionId: input.paypalSubscriptionId ?? sale.paypalSubscriptionId,
        paymentMethod: input.paymentMethod,
      },
    });

    // Para pagos únicos: registramos el importe TOTAL en una sola transaction.
    // Para suscripciones N ciclos: registramos SOLO la primera cuota aquí
    // (activateSaleAsPatient se llama en subscription.activated cuando
    // PayPal ya cobró el primer mes). Las siguientes cuotas llegan como
    // PAYMENT.SALE.COMPLETED y se registran una por una.
    const isSubscription = !!input.paypalSubscriptionId;
    const installments = sale.installmentCount ?? 0;
    const perCycleAmount =
      isSubscription && installments >= 2
        ? Math.round(sale.amountCents / installments) / 100
        : sale.amountCents / 100;

    await tx.transaction.create({
      data: {
        type: "income_new",
        category: `${sale.programType} ${sale.durationMonths}M`,
        amount: perCycleAmount,
        description: isSubscription
          ? `Pago vía PayPal · ${sale.programType} ${sale.durationMonths} meses · cuota 1/${installments}`
          : `Pago vía PayPal · ${sale.programType} ${sale.durationMonths} meses · ${input.paymentMethod}`,
        occurredAt: now,
        patientId: patient.id,
        professionalId: sale.closerId,
      },
    });

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
        notes: isSubscription
          ? `Alta inicial (PayPal ${installments} cuotas)`
          : "Alta inicial (pago PayPal)",
      },
    });

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

  console.log("[paypal-webhook] Patient creado", { patientId: patient.id, saleId: sale.id });

  try {
    await notifyHeadSuccess({
      type: "patient_new_unassigned",
      title: input.notifyTitle,
      body: input.notifyBody.replace("{{fullName}}", sale.lead.fullName),
      actionUrl: `/fisio/paciente/${patient.id}/ficha`,
    });
  } catch (err) {
    console.error("[paypal-webhook] Error notificando a head_success:", err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PAYMENT.CAPTURE.COMPLETED — Order de pago único
// ────────────────────────────────────────────────────────────────────────────
async function handleCaptureCompleted(capture: any) {
  const paymentToken: string | undefined =
    capture?.custom_id ?? capture?.supplementary_data?.related_ids?.custom_id;
  if (!paymentToken) {
    console.warn("[paypal-webhook] capture.completed sin custom_id", { captureId: capture?.id });
    return;
  }
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
  const paymentToken: string | undefined = subscription?.custom_id;
  if (!paymentToken) {
    console.warn("[paypal-webhook] subscription.activated sin custom_id", { subId: subscription?.id });
    return;
  }
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
  if (!subscriptionId) {
    // No es una cuota de suscripción (puede ser Orders API v1 antiguo).
    return;
  }
  const saleRecord = await prisma.sale.findUnique({
    where: { paypalSubscriptionId: subscriptionId },
  });
  if (!saleRecord || !saleRecord.patientId) {
    console.warn("[paypal-webhook] sale.completed sin sale/paciente asociado", { subscriptionId });
    return;
  }

  const amountValue = Number(sale?.amount?.total ?? 0);
  if (!amountValue) return;

  // Contar cuántas cuotas ya registramos (transactions income_new asociadas al
  // paciente + descripción con "cuota"). Simple: contamos transacciones
  // income_new de este paciente que empiezan por "Pago vía PayPal" con
  // "cuota N/M". Para el índice de cuota actual usamos count+1.
  const alreadyBilled = await prisma.transaction.count({
    where: {
      patientId: saleRecord.patientId,
      type: "income_new",
      description: { contains: "PayPal" },
    },
  });
  const cycleNumber = alreadyBilled + 1;
  const totalCycles = saleRecord.installmentCount ?? 0;

  // La primera cuota ya se registró en subscription.activated → si cycleNumber
  // es 1, esta ES la primera cuota, pero ya la contamos allí. Skip.
  if (cycleNumber === 1) {
    console.log("[paypal-webhook] Primera cuota ya contabilizada en activated, skip", {
      subscriptionId,
    });
    return;
  }

  await prisma.transaction.create({
    data: {
      type: "income_new",
      category: `${saleRecord.programType} ${saleRecord.durationMonths}M`,
      amount: amountValue,
      description: `Pago vía PayPal · ${saleRecord.programType} ${saleRecord.durationMonths} meses · cuota ${cycleNumber}/${totalCycles}`,
      occurredAt: new Date(),
      patientId: saleRecord.patientId,
      professionalId: saleRecord.closerId,
    },
  });
  console.log("[paypal-webhook] Cuota registrada", {
    subscriptionId,
    cycleNumber,
    totalCycles,
    amount: amountValue,
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

/**
 * Heurística para detectar si el pago fue con "Pay in 3/4" de PayPal (BNPL).
 */
function detectIsPayLater(capture: any): boolean {
  const blob = JSON.stringify(capture ?? {}).toLowerCase();
  return blob.includes("paylater") || blob.includes("pay_later") || blob.includes("pay_upon_invoice");
}
