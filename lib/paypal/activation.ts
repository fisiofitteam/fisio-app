/**
 * Activación de un Sale/RenewalCheckout como Patient y SubscriptionRenewal.
 *
 * Antes vivía dentro del webhook /api/webhooks/paypal, pero cuando el
 * webhook falla (firma inválida, timeout, rate-limit), TODOS los eventos
 * de PayPal se pierden y el paciente ve "estamos procesando" para
 * siempre — con el pago hecho en su banco.
 *
 * Extraerlas aquí permite:
 *   - Que el webhook las siga usando (mismo código, misma lógica).
 *   - Que los endpoints /api/sale/[token]/status y
 *     /api/renewal/[token]/status las llamen como fallback cuando ven
 *     un Order COMPLETED en PayPal pero el Sale/RenewalCheckout no está
 *     todavía activado en BD.
 *   - Que el endpoint admin de reconciliación las use para rescatar
 *     pagos huérfanos.
 *
 * IMPORTANTE — ambas son IDEMPOTENTES:
 *   - activateSaleAsPatient: si sale.status==="paid" && sale.patientId
 *     → return sin efectos.
 *   - applyRenewalCheckoutPaid: si checkout.status==="paid" &&
 *     checkout.renewalId → return sin efectos.
 *
 * Cualquier caller puede invocarlas dos veces sin daño.
 */
import { prisma } from "@/lib/prisma";
import { notifyHeadSuccess } from "@/lib/notifications";
import { applyRenewal } from "@/lib/renewals";

/**
 * Crea el Patient a partir del Sale, marca el Sale como paid, registra
 * el primer SubscriptionRenewal (alta inicial) y — si es one-shot — la
 * Transaction income_new. Notifica a head_success al terminar.
 *
 * Devuelve `patientId` si se activó (o si ya estaba activado con Patient).
 * Devuelve null si el sale no existe o no se pudo procesar.
 */
export async function activateSaleAsPatient(input: {
  saleId: string;
  paymentMethod: string;
  paypalCaptureId?: string | null;
  paypalSubscriptionId?: string | null;
  notifyTitle?: string;
  notifyBody?: string;
}): Promise<{ patientId: string } | null> {
  const sale = await prisma.sale.findUnique({
    where: { id: input.saleId },
    include: { lead: true },
  });
  if (!sale) return null;
  if (sale.status === "paid" && sale.patientId) {
    console.log("[paypal-activation] Sale ya procesado, skipping", { saleId: sale.id });
    return { patientId: sale.patientId };
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
      console.warn("[paypal-activation] manualAltaData JSON inválido", { saleId: sale.id });
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

    // One-shot: Transaction income_new con TOTAL aquí.
    // Suscripción: cada cuota se contabiliza en PAYMENT.SALE.COMPLETED
    // (ver handleSubscriptionCyclePayment en el webhook).
    const isSubscription = !!input.paypalSubscriptionId;
    const installments = sale.installmentCount ?? 0;

    if (!isSubscription) {
      await tx.transaction.create({
        data: {
          type: "income_new",
          category: `${sale.programType} ${sale.durationMonths}M`,
          amount: sale.amountCents / 100,
          description: `Pago vía PayPal · ${sale.programType} ${sale.durationMonths} meses · ${input.paymentMethod}`,
          occurredAt: now,
          patientId: patient.id,
          professionalId: sale.closerId,
        },
      });
    }

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

  console.log("[paypal-activation] Patient creado", { patientId: patient.id, saleId: sale.id });

  const notifyTitle = input.notifyTitle ?? "Nuevo paciente sin asignar";
  const notifyBody =
    input.notifyBody ??
    `{{fullName}} ha pagado el programa ${sale.programType} de ${sale.durationMonths} meses. Asígnale fisio.`;
  try {
    await notifyHeadSuccess({
      type: "patient_new_unassigned",
      title: notifyTitle,
      body: notifyBody.replace("{{fullName}}", sale.lead.fullName),
      actionUrl: `/fisio/paciente/${patient.id}/ficha`,
    });
  } catch (err) {
    console.error("[paypal-activation] Error notificando a head_success:", err);
  }

  return { patientId: patient.id };
}

/**
 * Aplica el pago de renovación: llama a applyRenewal() (crea/cierra el
 * SubscriptionRenewal correspondiente), marca el RenewalCheckout como
 * paid y registra la Transaction income_renewal si es one-shot.
 * Idempotente (skip si ya está paid con renewalId).
 */
export async function applyRenewalCheckoutPaid(opts: {
  checkoutId: string;
  paymentMethod: string;
  paypalCaptureId?: string | null;
  paypalSubscriptionId?: string | null;
  isSubscription: boolean;
}): Promise<{ renewalId: string } | null> {
  const checkout = await prisma.renewalCheckout.findUnique({
    where: { id: opts.checkoutId },
    include: { patient: { select: { fullName: true, assignedProfessionalId: true } } },
  });
  if (!checkout) return null;
  if (checkout.status === "paid" && checkout.renewalId) {
    console.log("[paypal-activation] RenewalCheckout ya procesado", { id: checkout.id });
    return { renewalId: checkout.renewalId };
  }

  const installments = checkout.installmentCount ?? 0;
  const totalEur = checkout.amountCents / 100;

  const isReservation = (checkout as any).isReservation === true;
  const { renewalId } = await applyRenewal({
    patientId: checkout.patientId,
    programType: checkout.programType,
    periodMonths: checkout.durationMonths,
    amountPaid: totalEur,
    professionalId: checkout.createdById,
    isReservation,
    notes: isReservation
      ? "Reserva de plaza (PayPal)"
      : opts.isSubscription
        ? `Renovación PayPal (${installments} cuotas)`
        : "Renovación PayPal",
  });

  await prisma.renewalCheckout.update({
    where: { id: checkout.id },
    data: {
      status: "paid",
      paidAt: new Date(),
      renewalId,
      paymentMethod: opts.paymentMethod,
      paypalCaptureId: opts.paypalCaptureId ?? checkout.paypalCaptureId,
      paypalSubscriptionId: opts.paypalSubscriptionId ?? checkout.paypalSubscriptionId,
    },
  });

  if (!opts.isSubscription) {
    await prisma.transaction.create({
      data: {
        type: "income_renewal",
        category: `${checkout.programType} ${checkout.durationMonths}M`,
        amount: totalEur,
        description: isReservation
          ? `Reserva de plaza PayPal · ${checkout.programType}`
          : `Renovación PayPal · ${checkout.programType} ${checkout.durationMonths} meses`,
        occurredAt: new Date(),
        patientId: checkout.patientId,
        professionalId: checkout.createdById,
      },
    });
  }

  console.log("[paypal-activation] Renovación aplicada", {
    checkoutId: checkout.id,
    renewalId,
    patient: checkout.patient.fullName,
    isSubscription: opts.isSubscription,
  });

  return { renewalId };
}
