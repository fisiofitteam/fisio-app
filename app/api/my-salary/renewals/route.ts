/**
 * GET /api/my-salary/renewals?year=YYYY&month=0-11
 *
 * Devuelve el detalle de las renovaciones atribuidas al profesional en
 * el mes indicado — las mismas que suma `renewalOwnCount` en /api/my-salary.
 *
 * Sirve para auditar el numero mostrado en "Mis metricas y salario" del
 * fisio: si dice "5 renovaciones", aqui salen las 5 con paciente, fecha
 * e importe, para poder cruzarlas manualmente con la BD.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { monthRangeUTC } from "@/lib/compensation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const year = Number(req.nextUrl.searchParams.get("year")) || now.getUTCFullYear();
  const monthRaw = req.nextUrl.searchParams.get("month");
  const month = monthRaw != null && monthRaw !== "" ? Number(monthRaw) : now.getUTCMonth();
  const { start: monthStart, end: monthEnd } = monthRangeUTC(year, month);

  // Mismo algoritmo que computeMonthlySalary — reproducimos la logica de
  // atribucion (decidedAt del follow-up) filtrando por pacientes asignados.
  const [decisionsInMonth, endedInMonth] = await Promise.all([
    prisma.subscriptionRenewal.findMany({
      where: {
        decidedAt: { gte: monthStart, lt: monthEnd },
        isReservation: false,
        patient: { isTest: false },
      },
      select: { patientId: true },
    }),
    prisma.subscriptionRenewal.findMany({
      where: {
        endDate: { gte: monthStart, lt: monthEnd },
        isReservation: false,
        patient: { isTest: false },
      },
      select: { patientId: true },
    }),
  ]);

  const patientIds = Array.from(new Set([
    ...decisionsInMonth.map((r) => r.patientId),
    ...endedInMonth.map((r) => r.patientId),
  ]));

  if (patientIds.length === 0) return NextResponse.json({ renewals: [] });

  const [history, patients] = await Promise.all([
    prisma.subscriptionRenewal.findMany({
      where: { patientId: { in: patientIds } },
      select: {
        id: true, patientId: true, startDate: true, endDate: true,
        decidedAt: true, amountPaid: true, programType: true,
        periodMonths: true, notes: true, isReservation: true,
      },
    }),
    prisma.patient.findMany({
      where: { id: { in: patientIds } },
      select: { id: true, fullName: true, assignedProfessionalId: true },
    }),
  ]);

  const patientById = new Map(patients.map((p) => [p.id, p]));
  const historyByPatient = new Map<string, typeof history>();
  for (const h of history) {
    if (!historyByPatient.has(h.patientId)) historyByPatient.set(h.patientId, []);
    historyByPatient.get(h.patientId)!.push(h);
  }

  const rows: Array<{
    patientId: string;
    patientName: string;
    programType: string | null;
    periodMonths: number;
    amountPaid: number | null;
    attributionDate: string;
    startDate: string | null;
    endDate: string | null;
    notes: string | null;
  }> = [];

  for (const [patientId, list] of historyByPatient) {
    const patient = patientById.get(patientId);
    if (!patient) continue;
    // Solo renovaciones de pacientes asignados a MI (segun regla actual).
    if (patient.assignedProfessionalId !== user.id) continue;

    const real = list
      .filter((h) => !h.isReservation && h.startDate)
      .sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0));

    for (let i = 1; i < real.length; i++) {
      const follow = real[i];
      const previous = real[i - 1];
      if (!previous.endDate || !follow.startDate) continue;
      const cutoff = previous.endDate.getTime() - 86400000;
      if (follow.startDate.getTime() < cutoff) continue;
      const attributionMs = follow.decidedAt.getTime();
      if (attributionMs < monthStart.getTime() || attributionMs >= monthEnd.getTime()) continue;

      rows.push({
        patientId,
        patientName: patient.fullName,
        programType: follow.programType,
        periodMonths: follow.periodMonths,
        amountPaid: follow.amountPaid,
        attributionDate: follow.decidedAt.toISOString(),
        startDate: follow.startDate?.toISOString() ?? null,
        endDate: follow.endDate?.toISOString() ?? null,
        notes: follow.notes,
      });
    }
  }

  rows.sort((a, b) => a.attributionDate.localeCompare(b.attributionDate));
  return NextResponse.json({ renewals: rows });
}
