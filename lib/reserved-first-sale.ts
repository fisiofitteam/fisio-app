import type { Prisma, Sale } from "@prisma/client";
import { prisma } from "./prisma";
import type { ActiveProfessional } from "./auth";
import { isReservedPatient } from "./reserved-patients";
import {
  generatePaymentToken,
  PRODUCT_CONFIG,
  type ProductCode,
} from "./stripe";

export class FirstSaleError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const conflict = (m: string): never => {
  throw new FirstSaleError(409, m);
};
type Tx = Prisma.TransactionClient;
type FirstSaleInput = {
  productCode: ProductCode;
  gross: number;
  installmentCount: number | null;
  paymentProvider: "paypal" | "stripe";
};
export function firstSaleInput(raw: unknown): FirstSaleInput {
  const b = raw as Record<string, unknown> | null;
  if (
    !b ||
    typeof b.productCode !== "string" ||
    !Object.prototype.hasOwnProperty.call(PRODUCT_CONFIG, b.productCode)
  )
    throw new FirstSaleError(400, "Programa no válido.");
  const euros = b.amountEuros,
    n = b.installmentCount,
    provider = b.paymentProvider;
  if (
    typeof euros !== "number" ||
    !Number.isFinite(euros) ||
    euros < 1 ||
    euros > 99999 ||
    Math.abs(euros * 100 - Math.round(euros * 100)) > 1e-7
  )
    throw new FirstSaleError(
      400,
      "Indica el precio total del programa, con un máximo de dos decimales.",
    );
  if (
    n != null &&
    (typeof n !== "number" || !Number.isInteger(n) || n < 2 || n > 12)
  )
    throw new FirstSaleError(400, "Indica entre 2 y 12 cuotas, o pago único.");
  if (provider !== "stripe" && provider !== "paypal")
    throw new FirstSaleError(400, "Proveedor no válido.");
  return {
    productCode: b.productCode as ProductCode,
    gross: Math.round(euros * 100),
    installmentCount: n == null ? null : Number(n),
    paymentProvider: provider,
  };
}
function linkInfo(s: Sale) {
  return {
    id: s.id,
    started: !!(
      s.checkoutStartedAt ||
      s.stripeSessionId ||
      s.paypalOrderId ||
      s.paypalSubscriptionId
    ),
    url: "/contratar/" + s.paymentToken,
    productCode: s.productCode,
    amountCents: s.amountCents,
    grossAmountCents: s.grossAmountCents,
    depositCents: s.depositAppliedCents || 0,
    installmentCount: s.installmentCount,
    paymentProvider: s.paymentProvider,
    expired: s.tokenExpiresAt <= new Date(),
    expiresAt: s.tokenExpiresAt.toISOString(),
  };
}
async function context(tx: Tx, patientId: string, user: ActiveProfessional) {
  const pat = await tx.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      assignedProfessionalId: true,
      isTest: true,
      derivations: {
        where: { toProfessionalId: user.id },
        select: { id: true },
        take: 1,
      },
    },
  });
  const leads = await tx.lead.findMany({
    where: { convertedPatientId: patientId },
    select: { id: true, closerId: true },
    take: 2,
  });
  const roles = [user.role, ...(user.extraRoles || [])];
  if (
    !pat ||
    !(
      user.isManager ||
      (roles.includes("fisio") &&
        (pat.assignedProfessionalId === user.id ||
          pat.derivations.length > 0)) ||
      (roles.includes("closer") && leads.some((l) => l.closerId === user.id))
    )
  )
    throw new FirstSaleError(403, "No puedes gestionar esta reserva.");
  if (pat.isTest)
    throw new FirstSaleError(
      409,
      "Esta ficha es de prueba y no admite cobros reales.",
    );
  if (!(await isReservedPatient(tx, patientId)))
    return conflict("Esta ficha no es una reserva pendiente de primera venta.");
  if (leads.length !== 1)
    return conflict(
      "Para vender desde esta ficha debe haber una única reserva comercial vinculada. Revisa el origen de la reserva.",
    );
  const lead = leads[0];
  const pending = await tx.sale.findMany({
    where: { OR: [{ leadId: lead.id }, { patientId }], status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  if (
    pending.some(
      (s) =>
        s.grossAmountCents == null &&
        (s.tokenExpiresAt > new Date() ||
          s.checkoutStartedAt ||
          s.stripeSessionId ||
          s.paypalOrderId ||
          s.paypalSubscriptionId),
    )
  )
    return conflict(
      "Hay un enlace de pago anterior de la reserva sin resolver. Revísalo antes de emitir otro.",
    );
  const priorRenewal = await tx.renewalCheckout.findFirst({
    where: {
      patientId,
      status: "pending",
      OR: [
        { tokenExpiresAt: { gt: new Date() } },
        { paypalOrderId: { not: null } },
        { paypalSubscriptionId: { not: null } },
        { stripeSessionId: { not: null } },
      ],
    },
    select: { id: true },
  });
  if (priorRenewal)
    return conflict(
      "Hay un cobro pendiente en esta ficha. Revísalo antes de crear el enlace de primera venta.",
    );
  const deposits = await tx.subscriptionRenewal.findMany({
    where: { patientId, isReservation: true, amountPaid: { gt: 0 } },
    select: { id: true, amountPaid: true, reservationConsumedAt: true },
    take: 2,
  });
  if (deposits.length > 1 || deposits[0]?.reservationConsumedAt)
    return conflict(
      "La ficha tiene varias señales o una señal aplicada a otro cobro. Revisa los pagos antes de emitir el enlace.",
    );
  // A returned deposit must never reduce a new contract.
  const paid = await tx.sale.findMany({
    where: {
      OR: [{ patientId }, { leadId: lead.id }],
      isReservation: true,
      status: "paid",
      refundedAt: null,
    },
    select: { patientId: true, leadId: true, amountCents: true },
    take: 2,
  });
  if (
    paid.length !== deposits.length ||
    paid.some(
      (s) =>
        s.patientId !== patientId ||
        s.leadId !== lead.id ||
        s.amountCents !== Math.round(deposits[0].amountPaid! * 100),
    )
  )
    return conflict(
      "El importe de la señal no se ha podido verificar con su cobro.",
    );
  const active = pending.find((s) => s.grossAmountCents != null);
  return {
    lead,
    deposit: deposits[0],
    depositCents: deposits[0] ? Math.round(deposits[0].amountPaid! * 100) : 0,
    active,
  };
}
export async function firstSaleLink(
  patientId: string,
  user: ActiveProfessional,
  input?: FirstSaleInput,
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const { lead, deposit, depositCents, active } = await context(
          tx,
          patientId,
          user,
        );
        if (!input)
          return { depositCents, activeSale: active ? linkInfo(active) : null };
        if (active && active.tokenExpiresAt > new Date()) {
          if (
            active.grossAmountCents !== input.gross ||
            active.productCode !== input.productCode ||
            active.paymentProvider !== input.paymentProvider ||
            active.installmentCount !== input.installmentCount ||
            active.firstSaleReservationId !== (deposit?.id ?? null)
          )
            return conflict(
              "Ya hay un enlace pendiente con otras condiciones. Usa o anula ese enlace antes de cambiar la oferta.",
            );
          return linkInfo(active);
        }
        const amountCents = input.gross - depositCents;
        if (amountCents < 100)
          return conflict(
            "La diferencia entre el precio total y la señal debe ser al menos 1 €. Comprueba el importe antes de cobrar.",
          );
        if (
          input.installmentCount &&
          Math.floor(amountCents / input.installmentCount) < 100
        )
          return conflict("Cada cuota debe ser de al menos 1 €.");
        const expires = new Date(Date.now() + 7 * 86400_000),
          config = PRODUCT_CONFIG[input.productCode];
        if (active) {
          // Never replace a checkout that might still settle with either provider.
          if (
            active.checkoutStartedAt ||
            active.paypalOrderId ||
            active.stripeSessionId ||
            active.paypalSubscriptionId
          )
            return conflict(
              "El enlace caducó con un pago iniciado. Confirma su estado antes de generar otro.",
            );
          await tx.sale.update({
            where: { id: active.id },
            data: { status: "expired" },
          });
        }
        const s = await tx.sale.create({
          data: {
            leadId: lead.id,
            patientId,
            closerId: lead.closerId || user.id,
            productCode: input.productCode,
            programType: config.programType,
            durationMonths: config.durationMonths,
            amountCents,
            grossAmountCents: input.gross,
            depositAppliedCents: depositCents,
            firstSaleReservationId: deposit?.id ?? null,
            paymentProvider: input.paymentProvider,
            installmentCount: input.installmentCount,
            paymentToken: generatePaymentToken(),
            tokenExpiresAt: expires,
            status: "pending",
            isReservation: false,
          },
        });
        return linkInfo(s);
      },
      { isolationLevel: "Serializable" },
    );
  } catch (e) {
    if (["P2034", "P2002"].includes((e as { code?: string })?.code ?? ""))
      return conflict(
        "La reserva acaba de cambiar. Actualiza para consultar su enlace activo.",
      );
    throw e;
  }
}

export async function activateReservedFirstSale(input: {
  saleId: string;
  paymentMethod: string;
  paypalCaptureId?: string | null;
  paypalSubscriptionId?: string | null;
}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const sale = await tx.sale.findUniqueOrThrow({
            where: { id: input.saleId },
          });
          const patientId = sale.patientId;
          if (!patientId || sale.grossAmountCents == null || sale.isReservation)
            throw Error("Primera venta no vinculada.");
          if (sale.status === "paid" && sale.initialPeriodId)
            return { patientId };
          if (sale.status !== "pending")
            throw Error(
              "El estado de esta primera venta requiere conciliación.",
            );
          if (
            !input.paymentMethod.startsWith(sale.paymentProvider) ||
            !!sale.installmentCount !== !!input.paypalSubscriptionId ||
            (sale.paypalSubscriptionId &&
              sale.paypalSubscriptionId !== input.paypalSubscriptionId)
          )
            throw Error("La forma de cobro no coincide con la oferta.");
          const lead = await tx.lead.findUnique({
            where: { id: sale.leadId },
            select: { convertedPatientId: true },
          });
          if (
            lead?.convertedPatientId !== patientId ||
            !(await isReservedPatient(tx, patientId))
          )
            throw Error(
              "La ficha ya no está en reserva. Revisa la conciliación.",
            );
          const deposit = sale.depositAppliedCents ?? 0;
          if (
            !Number.isInteger(deposit) ||
            deposit < 0 ||
            sale.grossAmountCents !== sale.amountCents + deposit ||
            !!deposit !== !!sale.firstSaleReservationId
          )
            throw Error("Importes incoherentes en la primera venta.");
          const now = new Date(),
            end = new Date(now);
          end.setMonth(end.getMonth() + sale.durationMonths);
          if (sale.firstSaleReservationId) {
            const verified = await tx.sale.count({
              where: {
                leadId: sale.leadId,
                patientId,
                isReservation: true,
                status: "paid",
                refundedAt: null,
                amountCents: deposit,
              },
            });
            if (verified !== 1)
              throw Error(
                "El cobro de la señal ha cambiado; revisa la conciliación.",
              );
            const claim = await tx.subscriptionRenewal.updateMany({
              where: {
                id: sale.firstSaleReservationId,
                patientId,
                isReservation: true,
                reservationConsumedAt: null,
                amountPaid: deposit / 100,
              },
              data: {
                reservationConsumedAt: now,
                status: "finished",
                endDate: now,
              },
            });
            if (claim.count !== 1)
              throw Error(
                "La señal no está disponible; revisa la conciliación.",
              );
          }
          const patient = await tx.patient.findUniqueOrThrow({
            where: { id: patientId },
            select: {
              assignedProfessional: {
                select: { active: true, deletedAt: true },
              },
              onboardingTasks: true,
            },
          });
          const assigned =
            !!patient.assignedProfessional?.active &&
            !patient.assignedProfessional?.deletedAt;
          const period = await tx.subscriptionRenewal.create({
            data: {
              patientId,
              programType: sale.programType,
              periodMonths: sale.durationMonths,
              startDate: now,
              endDate: end,
              status: "active",
              amountPaid: sale.grossAmountCents / 100,
              decidedAt: now,
              notes: sale.installmentCount
                ? "Alta inicial desde reserva · " +
                  sale.installmentCount +
                  " cuotas"
                : "Alta inicial desde reserva",
            },
          });
          await tx.patient.update({
            where: { id: patientId },
            data: {
              programType: sale.programType,
              programStartDate: now,
              programEndDate: end,
              programDurationMonths: sale.durationMonths,
              subscriptionStartDate: now,
              subscriptionPeriodMonths: sale.durationMonths,
              subscriptionTotalMonths: sale.durationMonths,
              onboardingStatus: assigned ? "active" : "pending_assignment",
              ...(!assigned ? { assignedProfessionalId: null } : {}),
              ...(patient.onboardingTasks == null
                ? {
                    onboardingTasks: {
                      anamnesis: false,
                      contract: false,
                      firstSession: false,
                    },
                  }
                : {}),
            },
          });
          await tx.sale.update({
            where: { id: sale.id },
            data: {
              status: "paid",
              paidAt: now,
              initialPeriodId: period.id,
              paymentMethod: input.paymentMethod,
              ...(input.paypalCaptureId
                ? { paypalCaptureId: input.paypalCaptureId }
                : {}),
              ...(input.paypalSubscriptionId
                ? { paypalSubscriptionId: input.paypalSubscriptionId }
                : {}),
            },
          });
          if (!sale.installmentCount)
            await tx.transaction.create({
              data: {
                type: "income_new",
                category: sale.programType + " " + sale.durationMonths + "M",
                amount: sale.amountCents / 100,
                description:
                  "Pago vía " +
                  (input.paymentMethod.startsWith("stripe")
                    ? "Stripe"
                    : "PayPal") +
                  " · saldo de alta inicial",
                occurredAt: now,
                patientId,
                professionalId: sale.closerId,
              },
            });
          await tx.lead.update({
            where: { id: sale.leadId },
            data: {
              status: "won",
              decidedAt: now,
              closerId: sale.closerId,
              inFollowUp: false,
            },
          });
          return { patientId };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (e) {
      if ((e as { code?: string })?.code === "P2034" && attempt < 2) continue;
      throw e;
    }
  }
}
