import { programPeriodWhere } from "./program-period-kind";
import type { Prisma } from "@prisma/client";

type PatientReader = Pick<Prisma.TransactionClient, "patient">;

/** Clinical access before a first program. An old deposit on a genuine existing
 * subscription is NOT a pre-program patient. A held deposit can still be in
 * this clinical stage; the sales endpoint decides whether that credit is usable. */
export const reservedPatientWhere: Prisma.PatientWhereInput = {
  AND: [
    { OR: [
      { onboardingStatus: "reserved" },
      {
        sales: { some: { isReservation: true, status: "paid", refundedAt: null } },
        renewals: { some: { isReservation: true, amountPaid: { gt: 0 } } },
      },
    ] },
    { renewals: { none: programPeriodWhere } },
    { sales: { none: { isReservation: false, status: "paid" } } },
    { renewalCheckouts: { none: { isReservation: false, status: "paid", programType: { not: "ADHOC" } } } },
  ],
};

export async function getReservedPatientIds(db: PatientReader, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.patient.findMany({ where: { id: { in: ids }, ...reservedPatientWhere }, select: { id: true } });
  return new Set(rows.map(p => p.id));
}
export async function isReservedPatient(db: PatientReader, id: string): Promise<boolean> {
  return !!await db.patient.findFirst({ where:{ id, ...reservedPatientWhere }, select:{ id:true } });
}
