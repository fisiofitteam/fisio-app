/**
 * POST /api/webhooks/paypal
 *
 * Webhook que escucha eventos de PayPal (Orders + Captures). Espejo del
 * de Stripe, pero adaptado al modelo REST de PayPal.
 *
 * Eventos procesados en Fase 1:
 *   - PAYMENT.CAPTURE.COMPLETED → marca Sale paid, crea Patient,
 *     notifica a head_success. Idéntico al flujo Stripe checkout.completed.
 *   - PAYMENT.CAPTURE.DENIED   → marca Sale failed.
 *   - PAYMENT.CAPTURE.REFUNDED → marca Sale refunded, notifica.
 *
 * Fases siguientes añadirán BILLING.SUBSCRIPTION.* (fase 2) y eventos de
 * renovación (fase 3). Los eventos no manejados se loggean pero no fallan.
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

  // Necesitamos body RAW para que PayPal recalcule la firma con el mismo
  // string exacto. Parseamos JSON después para el handler.
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
        // Informativo: user aprobó pero aún no capturado. Nosotros capturamos
        // en el returnUrl de la landing, no hace falta reaccionar aquí.
        console.log("[paypal-webhook] Order aprobada (sin acción)", { orderId: event.resource?.id });
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
// PAYMENT.CAPTURE.COMPLETED — crea Patient, marca Sale paid, notifica
// ────────────────────────────────────────────────────────────────────────────
async function handleCaptureCompleted(capture: any) {
  // El paymentToken vive en custom_id de la Order (lo pusimos en createOrder).
  // PayPal puede duplicar en resource.custom_id o en purchase_units[0].custom_id.
  const paymentToken: string | undefined =
    capture?.custom_id ?? capture?.supplementary_data?.related_ids?.custom_id;
  if (!paymentToken) {
    console.warn("[paypal-webhook] capture.completed sin custom_id", { captureId: capture?.id });
    return;
  }

  const sale = await prisma.sale.findUnique({
    where: { paymentToken },
    include: { lead: true },
  });
  if (!sale) {
    console.warn("[paypal-webhook] Sale no encontrado", { paymentToken });
    return;
  }

  // IDEMPOTENCIA: si ya está paid, ya procesamos. Salimos OK.
  if (sale.status === "paid" && sale.patientId) {
    console.log("[paypal-webhook] Sale ya procesado, skipping", { saleId: sale.id });
    return;
  }

  // Anti-tampering: verificar que el amount coincide (PayPal manda "34.95").
  const amountValue = Number(capture?.amount?.value ?? 0);
  const receivedCents = Math.round(amountValue * 100);
  if (receivedCents && receivedCents !== sale.amountCents) {
    console.error("[paypal-webhook] AMOUNT MISMATCH", {
      saleId: sale.id,
      expected: sale.amountCents,
      received: receivedCents,
    });
    // Loggeado pero seguimos (mismo criterio que el webhook Stripe).
  }

  // Detectar Pay Later (BNPL) vs one-shot: si PayPal reporta "PAY_UPON_INVOICE"
  // o "PAY_LATER" en payment_source o supplementary_data lo marcamos.
  const isPayLater = detectIsPayLater(capture);
  const paymentMethod = isPayLater ? "paypal_paylater" : "paypal";

  const now = new Date();
  const programEndDate = new Date(now);
  programEndDate.setMonth(programEndDate.getMonth() + sale.durationMonths);

  // Datos extra que vienen del modal "Nuevo paciente" cuando el Sale se
  // generó como alta manual (assignedProfessionalId, diagnosis). Mismo
  // parseo que Stripe.
  let manualAlta: { assignedProfessionalId?: string; diagnosis?: string } = {};
  if ((sale as any).manualAltaData) {
    try {
      const parsed = JSON.parse((sale as any).manualAltaData);
      if (parsed && typeof parsed === "object") manualAlta = parsed;
    } catch {
      console.warn("[paypal-webhook] manualAltaData JSON inválido", { saleId: sale.id });
    }
  }

  const result = await prisma.$transaction(async (tx) => {
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
        paypalCaptureId: capture?.id ?? null,
        paymentMethod,
      },
    });

    await tx.transaction.create({
      data: {
        type: "income_new",
        category: `${sale.programType} ${sale.durationMonths}M`,
        amount: sale.amountCents / 100,
        description: `Pago vía PayPal · ${sale.programType} ${sale.durationMonths} meses · ${paymentMethod}`,
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
        notes: "Alta inicial (pago PayPal)",
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

  console.log("[paypal-webhook] Patient creado", { patientId: result.id, saleId: sale.id });

  try {
    await notifyHeadSuccess({
      type: "patient_new_unassigned",
      title: "Nuevo paciente sin asignar",
      body: `${sale.lead.fullName} ha pagado el programa ${sale.programType} de ${sale.durationMonths} meses (PayPal${isPayLater ? " · fraccionado" : ""}). Asígnale fisio.`,
      actionUrl: `/fisio/paciente/${result.id}/ficha`,
    });
  } catch (err) {
    console.error("[paypal-webhook] Error notificando a head_success:", err);
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
  // PayPal manda distinta forma según refund vs reversal. Buscamos el sale
  // por capture id o por custom_id.
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

  // Notificar al equipo para que sepa
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
 * PayPal marca esto en `capture.payment_source` o en algún supplementary_data
 * en función del país. Simplemente miramos si aparece "pay_later"
 * o "paylater" en algún texto del payload.
 */
function detectIsPayLater(capture: any): boolean {
  const blob = JSON.stringify(capture ?? {}).toLowerCase();
  return blob.includes("paylater") || blob.includes("pay_later") || blob.includes("pay_upon_invoice");
}
