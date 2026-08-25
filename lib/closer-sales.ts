/**
 * Ventas atribuidas a un closer en un periodo, con el IMPORTE CONTRATADO
 * (no lo cobrado) — base sobre la que se calcula su comision.
 *
 * Fuente de verdad por tipo de programa:
 *   - PREVENTION: PatientSubscription.amountCents del paciente (importe
 *     de la cuota mensual, decision CEO 2026-08-25).
 *   - Resto (RECUPERA / CONSOLIDA / ADVANCE): SubscriptionRenewal.amountPaid
 *     del PRIMER periodo del paciente (alta inicial). Este valor ya
 *     refleja el total contratado — incluso para fraccionados PayPal
 *     (webhook y flujos manuales lo pueblan asi, como se ve en la ficha
 *     de suscripcion del paciente: "Periodo 1 · 6 meses · 1097,00 €").
 *
 * No dependemos de Sale.installmentCount, que en la practica esta a menudo
 * a null en fraccionados creados antes de la fase 2 PayPal o en altas
 * manuales.
 *
 * Un lead won del closer sin Patient asociado (ni por convertedPatientId
 * ni por email) se ignora — no podemos atribuir un importe fiable.
 */
import { prisma } from "@/lib/prisma";

export type CloserSaleRow = {
  key: string;
  leadId: string;
  patientId: string | null;
  patientName: string;
  programType: string | null;
  saleType: "one_shot" | "installment" | "prevention";
  contractedAmount: number; // EUR
  decidedAt: Date;
};

export async function getCloserSalesInPeriod(
  closerId: string | undefined,
  from: Date,
  to: Date
): Promise<CloserSaleRow[]> {
  // Todos los leads won del closer en el periodo.
  const leads = await prisma.lead.findMany({
    where: {
      ...(closerId ? { closerId } : {}),
      status: "won",
      decidedAt: { gte: from, lt: to },
    },
    include: {
      convertedPatient: {
        select: {
          id: true, fullName: true, programType: true, email: true,
          subscriptions: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { amountCents: true },
          },
          renewals: {
            where: { isReservation: false },
            orderBy: { startDate: "asc" },
            take: 1,
            select: { amountPaid: true, notes: true, periodMonths: true },
          },
        },
      },
    },
    orderBy: { decidedAt: "desc" },
  });

  // Fallback: para leads sin convertedPatientId (p.ej. Prevention por
  // landing antes del fix upstream) buscamos Patient por email o phone.
  type PatientLite = {
    id: string;
    fullName: string;
    programType: string | null;
    subscriptionAmountCents: number | null;
    renewalAmountPaid: number | null;
    renewalNotes: string | null;
  };
  const orphanLeads = leads.filter((l) => !l.convertedPatient);
  const orphanEmails = orphanLeads.map((l) => l.email?.toLowerCase()).filter(Boolean) as string[];
  const orphanPhones = orphanLeads.map((l) => l.phone).filter(Boolean) as string[];
  const patientsByEmail = new Map<string, PatientLite>();
  const patientsByPhone = new Map<string, PatientLite>();

  if (orphanEmails.length > 0 || orphanPhones.length > 0) {
    const orConds: any[] = [];
    if (orphanEmails.length > 0) orConds.push({ email: { in: orphanEmails, mode: "insensitive" } });
    if (orphanPhones.length > 0) orConds.push({ phone: { in: orphanPhones } });

    const patients = await prisma.patient.findMany({
      where: { OR: orConds },
      select: {
        id: true, email: true, phone: true, fullName: true, programType: true,
        subscriptions: { orderBy: { createdAt: "asc" }, take: 1, select: { amountCents: true } },
        renewals: {
          where: { isReservation: false },
          orderBy: { startDate: "asc" },
          take: 1,
          select: { amountPaid: true, notes: true },
        },
      },
    });
    for (const p of patients) {
      const lite: PatientLite = {
        id: p.id,
        fullName: p.fullName,
        programType: p.programType,
        subscriptionAmountCents: p.subscriptions?.[0]?.amountCents ?? null,
        renewalAmountPaid: p.renewals?.[0]?.amountPaid ?? null,
        renewalNotes: p.renewals?.[0]?.notes ?? null,
      };
      if (p.email) patientsByEmail.set(p.email.toLowerCase(), lite);
      if (p.phone) patientsByPhone.set(p.phone, lite);
    }
  }

  const rows: CloserSaleRow[] = [];
  for (const l of leads) {
    if (!l.decidedAt) continue;

    // Resolver Patient + datos financieros.
    let patientId: string | null = null;
    let patientName = l.fullName || "—";
    let programType: string | null = null;
    let subscriptionAmountCents: number | null = null;
    let renewalAmountPaid: number | null = null;
    let renewalNotes: string | null = null;

    if (l.convertedPatient) {
      patientId = l.convertedPatient.id;
      patientName = l.convertedPatient.fullName;
      programType = l.convertedPatient.programType;
      subscriptionAmountCents = l.convertedPatient.subscriptions?.[0]?.amountCents ?? null;
      renewalAmountPaid = l.convertedPatient.renewals?.[0]?.amountPaid ?? null;
      renewalNotes = l.convertedPatient.renewals?.[0]?.notes ?? null;
    } else {
      const byEmail = l.email ? patientsByEmail.get(l.email.toLowerCase()) : undefined;
      const byPhone = l.phone ? patientsByPhone.get(l.phone) : undefined;
      const p = byEmail ?? byPhone;
      if (p) {
        patientId = p.id;
        patientName = p.fullName;
        programType = p.programType;
        subscriptionAmountCents = p.subscriptionAmountCents;
        renewalAmountPaid = p.renewalAmountPaid;
        renewalNotes = p.renewalNotes;
      }
    }

    // Si no encontramos Patient asociado, incluimos igualmente el lead
    // (para que el closer vea todas sus ventas ganadas) pero con importe
    // 0 y saleType "one_shot" — la UI pintara "—" en la columna precio.
    // Asi seguimos coherentes con el contador `metrics.won`.

    let contractedAmount = 0;
    let saleType: CloserSaleRow["saleType"] = "one_shot";

    if (programType === "PREVENTION") {
      contractedAmount = subscriptionAmountCents != null ? subscriptionAmountCents / 100 : 0;
      saleType = "prevention";
    } else {
      contractedAmount = renewalAmountPaid ?? 0;
      // Detectamos fraccionado leyendo la nota del alta inicial (webhook
      // PayPal escribe "Alta inicial (PayPal N cuotas)").
      if (renewalNotes && /cuotas?/i.test(renewalNotes)) {
        saleType = "installment";
      }
    }

    rows.push({
      key: `lead:${l.id}`,
      leadId: l.id,
      patientId,
      patientName,
      programType,
      saleType,
      contractedAmount,
      decidedAt: l.decidedAt,
    });
  }

  return rows;
}

export function sumContracted(rows: CloserSaleRow[]): number {
  return rows.reduce((s, r) => s + r.contractedAmount, 0);
}
