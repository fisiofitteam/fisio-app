/**
 * Ventas atribuidas a un closer en un periodo, con el importe CONTRATADO
 * (no lo cobrado) — que es la base sobre la que se calcula su comision.
 *
 * Reglas:
 *   - RECUPERA/CONSOLIDA/ADVANCE pagados: fila Sale con status=paid.
 *     contractedAmount = amountCents * (installmentCount || 1) / 100.
 *     En fraccionado la Sale solo guarda la cuota; multiplicamos por N.
 *   - Prevention comprada por landing/link: no crea Sale, sino
 *     PatientSubscription. Detectamos el Lead won del closer cuyo Patient
 *     tiene PatientSubscription. contractedAmount = PatientSubscription
 *     .amountCents / 100 (importe de la primera transaccion, decision
 *     2026-08-25 del CEO).
 *
 * Un mismo Lead puede aparecer una sola vez: si tiene Sale la usamos;
 * si no y es Prevention, cae al fallback.
 */
import { prisma } from "@/lib/prisma";

export type CloserSaleRow = {
  key: string;
  leadId: string;
  patientId: string | null;
  patientName: string;
  programType: string | null;
  saleType: "one_shot" | "installment" | "prevention" | "legacy";
  contractedAmount: number; // EUR
  paidSoFar: number;         // EUR — para poder mostrar tambien lo cobrado si hace falta
  decidedAt: Date;
};

export async function getCloserSalesInPeriod(
  closerId: string | undefined,
  from: Date,
  to: Date
): Promise<CloserSaleRow[]> {
  // 1) Sales (RECUPERA/CONSOLIDA/ADVANCE) pagadas del closer en el periodo.
  // closerId undefined = todas las del equipo (scope "all" en Compensation).
  const paidSales = await prisma.sale.findMany({
    where: {
      ...(closerId ? { closerId } : {}),
      status: "paid",
      paidAt: { gte: from, lt: to },
    },
    include: {
      lead: { select: { id: true, fullName: true, convertedPatientId: true } },
      patient: { select: { id: true, fullName: true, programType: true } },
    },
    orderBy: { paidAt: "desc" },
  });

  const leadIdsCoveredBySale = new Set(paidSales.map((s) => s.leadId));

  const rows: CloserSaleRow[] = paidSales.map((s) => {
    // Numero de cuotas del contrato:
    //  - installmentCount explicito si existe (fase 2 PayPal en adelante)
    //  - fallback: si tiene paypalSubscriptionId (fraccionado por
    //    suscripcion) pero installmentCount es null, asumimos una cuota
    //    por mes contratado (durationMonths). Cubre ventas creadas antes
    //    de que se persistiera installmentCount.
    //  - si no, pago unico (1).
    const explicitInstallments = s.installmentCount && s.installmentCount >= 2 ? s.installmentCount : null;
    const isSubscription = !!s.paypalSubscriptionId;
    const inferredInstallments = explicitInstallments ?? (isSubscription ? s.durationMonths : 1);
    const installments = Math.max(1, inferredInstallments);
    const perInstallmentEur = s.amountCents / 100;
    const contractedAmount = perInstallmentEur * installments;
    return {
      key: `sale:${s.id}`,
      leadId: s.leadId,
      patientId: s.patient?.id ?? null,
      patientName: s.patient?.fullName ?? s.lead?.fullName ?? "—",
      programType: s.patient?.programType ?? s.programType ?? null,
      saleType: installments > 1 ? "installment" : "one_shot",
      contractedAmount,
      paidSoFar: perInstallmentEur,
      decidedAt: s.paidAt ?? s.createdAt,
    };
  });

  // 2) Prevention won leads del closer.
  // Ojo: /api/prevention/confirm marca el Lead como won pero NO setea
  // convertedPatientId (el Patient se crea aparte). Por eso NO podemos
  // filtrar por convertedPatient.programType — dejariamos fuera los
  // David-Orga del mundo. En su lugar, tomamos TODOS los leads won del
  // closer sin Sale, y buscamos su Patient por convertedPatientId primero,
  // y si no, por email.
  const wonLeads = await prisma.lead.findMany({
    where: {
      ...(closerId ? { closerId } : {}),
      status: "won",
      decidedAt: { gte: from, lt: to },
    },
    include: {
      convertedPatient: {
        select: {
          id: true, fullName: true, programType: true,
          subscriptions: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { amountCents: true },
          },
        },
      },
    },
    orderBy: { decidedAt: "desc" },
  });

  // Para leads sin convertedPatient, intentamos casar por email.
  const orphanEmails = wonLeads
    .filter((l) => !l.convertedPatient && l.email)
    .map((l) => l.email!.toLowerCase());
  const patientsByEmail = new Map<string, { id: string; fullName: string; programType: string | null; subscriptionAmountCents: number | null }>();
  if (orphanEmails.length > 0) {
    const patients = await prisma.patient.findMany({
      where: { email: { in: orphanEmails, mode: "insensitive" } },
      select: {
        id: true, email: true, fullName: true, programType: true,
        subscriptions: { orderBy: { createdAt: "asc" }, take: 1, select: { amountCents: true } },
      },
    });
    for (const p of patients) {
      if (!p.email) continue;
      patientsByEmail.set(p.email.toLowerCase(), {
        id: p.id,
        fullName: p.fullName,
        programType: p.programType,
        subscriptionAmountCents: p.subscriptions?.[0]?.amountCents ?? null,
      });
    }
  }

  for (const l of wonLeads) {
    if (leadIdsCoveredBySale.has(l.id)) continue;
    if (!l.decidedAt) continue;

    // Resolver Patient + tipo de programa.
    let patientId: string | null = null;
    let patientName = l.fullName || "—";
    let programType: string | null = null;
    let subscriptionAmountCents: number | null = null;

    if (l.convertedPatient) {
      patientId = l.convertedPatient.id;
      patientName = l.convertedPatient.fullName;
      programType = l.convertedPatient.programType;
      subscriptionAmountCents = l.convertedPatient.subscriptions?.[0]?.amountCents ?? null;
    } else if (l.email) {
      const p = patientsByEmail.get(l.email.toLowerCase());
      if (p) {
        patientId = p.id;
        patientName = p.fullName;
        programType = p.programType;
        subscriptionAmountCents = p.subscriptionAmountCents;
      }
    }

    // Solo procesamos Prevention aqui (el bloque 3 hace fallback para
    // RECUPERA/CONSOLIDA/ADVANCE sin Sale).
    if (programType !== "PREVENTION") continue;

    const amountEur = subscriptionAmountCents != null ? subscriptionAmountCents / 100 : 0;
    rows.push({
      key: `prev:${l.id}`,
      leadId: l.id,
      patientId,
      patientName,
      programType,
      saleType: "prevention",
      contractedAmount: amountEur,
      paidSoFar: amountEur,
      decidedAt: l.decidedAt,
    });
  }

  // 3) Fallback: leads won (no Prevention) sin Sale asociada. Ventas
  // antiguas o manuales que solo tienen Transaction income_new. Sacamos
  // el importe de la suma de esas transacciones — no podemos multiplicar
  // por cuotas porque no tenemos ese dato, asi que representa el
  // contratado real hasta donde nos dice la BD.
  const legacyLeads = await prisma.lead.findMany({
    where: {
      ...(closerId ? { closerId } : {}),
      status: "won",
      decidedAt: { gte: from, lt: to },
      convertedPatient: { programType: { notIn: ["PREVENTION"] } },
    },
    include: {
      convertedPatient: { select: { id: true, fullName: true, programType: true } },
    },
    orderBy: { decidedAt: "desc" },
  });
  const legacyLeadsFiltered = legacyLeads.filter(
    (l) => !leadIdsCoveredBySale.has(l.id) && l.convertedPatient && l.decidedAt
  );
  if (legacyLeadsFiltered.length > 0) {
    const patientIds = legacyLeadsFiltered.map((l) => l.convertedPatient!.id);
    const txs = await prisma.transaction.findMany({
      where: { type: "income_new", patientId: { in: patientIds } },
      select: { patientId: true, amount: true },
    });
    const txByPatient = new Map<string, number>();
    for (const t of txs) {
      if (!t.patientId) continue;
      txByPatient.set(t.patientId, (txByPatient.get(t.patientId) ?? 0) + t.amount);
    }
    for (const l of legacyLeadsFiltered) {
      const amt = txByPatient.get(l.convertedPatient!.id) ?? 0;
      rows.push({
        key: `legacy:${l.id}`,
        leadId: l.id,
        patientId: l.convertedPatient!.id,
        patientName: l.convertedPatient!.fullName,
        programType: l.convertedPatient!.programType,
        saleType: "legacy",
        contractedAmount: amt,
        paidSoFar: amt,
        decidedAt: l.decidedAt!,
      });
    }
  }

  // Orden final por fecha descendente.
  rows.sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime());
  return rows;
}

export function sumContracted(rows: CloserSaleRow[]): number {
  return rows.reduce((s, r) => s + r.contractedAmount, 0);
}
