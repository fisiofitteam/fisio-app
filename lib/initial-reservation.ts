import { randomBytes } from "node:crypto";
import type { Lead, Prisma } from "@prisma/client";
import { isReservedPatient } from "@/lib/reserved-patients";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;
type Actor = { id: string; role: string; extraRoles?: readonly string[] };
export class ReservationConflict extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export const canOperateReservation = (actor: Actor, closerId: string | null) =>
  actor.role === "ceo" ||
  actor.role === "head_success" ||
  (actor.id === closerId && (actor.role === "closer" || actor.extraRoles?.includes("closer") === true));

export function reserveEmail(lead: Pick<Lead, "email" | "contactValue" | "contactType">, given?: unknown) {
  const value = given ?? (lead.email || (lead.contactType === "email" ? lead.contactValue : ""));
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ReservationConflict(
      "Indica un correo válido para que el paciente pueda acceder a sus test.",
      400,
    );
  return email;
}
export async function reservationTx<T>(f: (tx: Tx) => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await prisma.$transaction(f, { isolationLevel: "Serializable", timeout: 12000 });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "P2034" && i < 2) continue;
      if (code === "P2034" || code === "P2002")
        throw new ReservationConflict("La reserva ha cambiado. Actualiza la ficha antes de continuar.");
      throw e;
    }
  }
}
async function compatiblePatient(tx: Tx, lead: Lead, email: string) {
  if (lead.convertedPatientId) {
    const p = await tx.patient.findUnique({
      where: { id: lead.convertedPatientId },
      select: { id: true, email: true },
    });
    if (!p || p.email?.toLowerCase() !== email || !(await isReservedPatient(tx, p.id)))
      throw new ReservationConflict(
        "Este lead ya está vinculado a otra ficha o a un programa. No se ha creado otra reserva.",
      );
    return p.id;
  }
  if (
    await tx.patient.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    })
  )
    throw new ReservationConflict(
      "Este correo ya tiene una ficha. Comprueba el paciente antes de generar una reserva.",
    );
  return null;
}
async function hasDeposit(tx: Tx, patientId: string) {
  return await tx.subscriptionRenewal.findFirst({
    where: { patientId, isReservation: true, reservationConsumedAt: null },
    select: { id: true, amountPaid: true },
  });
}
async function profile(tx: Tx, lead: Lead, email: string, assignee?: string | null) {
  const existing = await compatiblePatient(tx, lead, email);
  if (existing) return existing;
  if (assignee) {
    const available = await tx.professional.findFirst({
      where: { id: assignee, active: true, deletedAt: null, role: { in: ["fisio", "ceo", "head_success"] } },
      select: { id: true },
    });
    if (!available) throw new ReservationConflict("El fisio elegido ya no está disponible.");
  }
  const phone = (lead.phone || (lead.contactType === "phone" ? lead.contactValue : "")).trim() || null;
  const p = await tx.patient.create({
    data: {
      fullName: lead.fullName,
      email,
      phone,
      instagram: lead.instagram,
      country: lead.country,
      assignedProfessionalId: assignee || null,
      programType: "RESERVA",
      onboardingStatus: "reserved",
      subscriptionPeriodMonths: 0,
      subscriptionTotalMonths: 0,
      // No programme, contract, fake first period or onboarding gate before purchase.
    },
    select: { id: true },
  });
  return p.id;
}
async function reserveLead(tx: Tx, leadId: string, id: string, email: string) {
  await tx.lead.update({
    where: { id: leadId },
    data: { convertedPatientId: id, status: "reserved", decidedAt: null, inFollowUp: false, email },
  });
}
async function deposit(
  tx: Tx,
  patientId: string,
  sale: { id: string; amountCents: number; closerId: string; programType: string },
  now: Date,
) {
  if (sale.amountCents < 1 || !Number.isSafeInteger(sale.amountCents))
    throw new ReservationConflict("El importe de la señal no es válido.", 400);
  if (await hasDeposit(tx, patientId))
    throw new ReservationConflict("Ya hay una señal registrada en esta reserva.");
  const amount = sale.amountCents / 100;
  await tx.subscriptionRenewal.create({
    data: {
      id: "deposit:" + sale.id,
      patientId,
      programType: sale.programType,
      periodMonths: 0,
      status: "reserved",
      isReservation: true,
      amountPaid: amount,
      decidedAt: now,
      notes: "Señal para primera contratación; no es un periodo de programa.",
    },
  });
  await tx.transaction.create({
    data: {
      id: "deposit:" + sale.id,
      patientId,
      professionalId: sale.closerId,
      type: "income_new",
      category: "Reserva de plaza",
      description: "Reserva de plaza · señal para la primera contratación",
      occurredAt: now,
      amount,
    },
  });
}
type SaleCreate = Prisma.SaleUncheckedCreateInput;
// Called from link generation in the same serializable transaction as creation,
// so a manual deposit and an online deposit can't both be opened for this lead.
export async function createReservationSaleLink(data: SaleCreate, actor: Actor) {
  return reservationTx(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: data.leadId } });
    if (!lead || !canOperateReservation(actor, lead.closerId))
      throw new ReservationConflict("Reserva no disponible.", 403);
    if (["lost", "cancelled"].includes(lead.status))
      throw new ReservationConflict("El lead no está disponible para una reserva.");
    const id = await compatiblePatient(tx, lead, reserveEmail(lead));
    if (id && (await hasDeposit(tx, id)))
      throw new ReservationConflict(
        "La señal ya está registrada. Puedes venderle el programa desde Pacientes.",
      );
    const pending = await tx.sale.findFirst({
      where: {
        leadId: lead.id,
        status: "pending",
        OR: [
          { tokenExpiresAt: { gt: new Date() } },
          { checkoutStartedAt: { not: null } },
          { stripeSessionId: { not: null } },
          { paypalOrderId: { not: null } },
          { paypalSubscriptionId: { not: null } },
        ],
      },
      select: { id: true },
    });
    if (pending)
      throw new ReservationConflict(
        "Hay otro enlace de pago pendiente. Compruébalo antes de abrir otra reserva.",
      );
    return tx.sale.create({ data });
  });
}
export type ManualReserveInput = {
  email?: unknown;
  assignedProfessionalId?: unknown;
  amountEuros?: unknown;
  paymentMethod?: unknown;
  programType?: unknown;
};
export async function registerManualReservation(leadId: string, actor: Actor, body: ManualReserveInput) {
  return reservationTx(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: leadId } });
    if (!lead || !canOperateReservation(actor, lead.closerId))
      throw new ReservationConflict("Reserva no disponible.", 403);
    if (["lost", "cancelled"].includes(lead.status))
      throw new ReservationConflict("El lead no está disponible para una reserva.");
    const email = reserveEmail(lead, body.email);
    const euros = body.amountEuros ?? 0;
    if (
      typeof euros !== "number" ||
      !Number.isFinite(euros) ||
      euros < 0 ||
      euros > 99999 ||
      Math.abs(Math.round(euros * 100) - euros * 100) > 0.000001
    )
      throw new ReservationConflict("El importe debe ser de 0 a 99.999 € con hasta dos decimales.", 400);
    const cents = Math.round(euros * 100);
    if (body.assignedProfessionalId != null && typeof body.assignedProfessionalId !== "string")
      throw new ReservationConflict("Fisio no válido.", 400);
    const requestedProgram = body.programType ?? "RESERVA";
    if (!["RECUPERA", "CONSOLIDA", "ADVANCE", "RESERVA"].includes(String(requestedProgram)))
      throw new ReservationConflict("Programa no válido.", 400);
    const requestedMethod = body.paymentMethod ?? "Otro";
    if (cents && !["Transferencia", "Bizum", "Efectivo", "PayPal", "Otro"].includes(String(requestedMethod)))
      throw new ReservationConflict("Método de pago no válido.", 400);
    // Manual repeated requests on the same lead cannot create another cash movement.
    const previous = await tx.sale.findFirst({
      where: { leadId, isReservation: true, status: "paid" },
      select: { id: true, patientId: true, amountCents: true, paymentProvider: true, paymentMethod: true },
    });
    if (previous && cents) {
      if (
        previous.amountCents === cents &&
        previous.patientId === lead.convertedPatientId &&
        previous.paymentProvider === "manual" &&
        previous.paymentMethod === requestedMethod &&
        previous.patientId &&
        (await compatiblePatient(tx, lead, email))
      )
        return { patientId: previous.patientId };
      throw new ReservationConflict("La reserva ya tiene una señal. No se ha añadido un segundo ingreso.");
    }
    if (
      await tx.sale.findFirst({
        where: {
          leadId,
          status: "pending",
          OR: [
            { tokenExpiresAt: { gt: new Date() } },
            { checkoutStartedAt: { not: null } },
            { stripeSessionId: { not: null } },
            { paypalOrderId: { not: null } },
            { paypalSubscriptionId: { not: null } },
          ],
        },
        select: { id: true },
      })
    )
      throw new ReservationConflict(
        "Hay un enlace de pago pendiente. Comprueba su estado antes de registrar la reserva.",
      );
    const id = await profile(tx, lead, email, body.assignedProfessionalId as string | null | undefined);
    if (cents) {
      const now = new Date();
      const sale = await tx.sale.create({
        data: {
          leadId,
          closerId: lead.closerId ?? actor.id,
          patientId: id,
          isReservation: true,
          paidAt: now,
          status: "paid",
          productCode: "RESERVA",
          programType: String(requestedProgram),
          durationMonths: 0,
          amountCents: cents,
          currency: "eur",
          paymentToken: randomBytes(24).toString("hex"),
          tokenExpiresAt: now,
          paymentMethod: String(requestedMethod),
          paymentProvider: "manual",
        },
      });
      await deposit(tx, id, sale, now);
    }
    await reserveLead(tx, lead.id, id, email);
    return { patientId: id };
  });
}
export async function activateInitialReservation(input: {
  saleId: string;
  paymentMethod: string;
  paypalCaptureId?: string | null;
  paypalSubscriptionId?: string | null;
}) {
  return reservationTx(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: input.saleId }, include: { lead: true } });
    if (!sale || !sale.isReservation) throw new ReservationConflict("Reserva no disponible.", 404);
    if (sale.status === "paid" && sale.patientId) return { patientId: sale.patientId, created: false };
    if (
      !["pending", "paid"].includes(sale.status) ||
      (sale.installmentCount && sale.installmentCount > 1) ||
      input.paypalSubscriptionId
    )
      throw new ReservationConflict("Estado de la señal no válido.");
    const email = reserveEmail(sale.lead),
      now = new Date();
    let assignee: string | null = null;
    if (sale.manualAltaData) {
      try {
        const data = JSON.parse(sale.manualAltaData);
        if (typeof data.assignedProfessionalId === "string") assignee = data.assignedProfessionalId;
      } catch {}
    }
    const id = await profile(tx, sale.lead, email, assignee);
    if (sale.patientId && sale.patientId !== id)
      throw new ReservationConflict("La señal pertenece a otra ficha.");
    await deposit(tx, id, sale, now);
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        patientId: id,
        paidAt: now,
        status: "paid",
        paymentMethod: input.paymentMethod,
        paypalCaptureId: input.paypalCaptureId ?? sale.paypalCaptureId,
      },
    });
    await reserveLead(tx, sale.leadId, id, email);
    return { patientId: id, created: true };
  });
}
