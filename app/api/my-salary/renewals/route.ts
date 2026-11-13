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
import { listRealRenewalsInPeriod } from "@/lib/renewals";
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

  const attributed = (await listRealRenewalsInPeriod(monthStart, new Date(monthEnd.getTime() - 1)))
    .filter(r => r.assignedProfessionalId === user.id);
  if (!attributed.length) return NextResponse.json({ renewals: [] });
  const details = await prisma.subscriptionRenewal.findMany({
    where: { id: { in: attributed.map(r => r.id) }, patient: { assignedProfessionalId: user.id } },
    select: { patientId: true, patient: { select: { fullName: true } }, programType: true,
      periodMonths: true, amountPaid: true, decidedAt: true, startDate: true, endDate: true, notes: true },
  });
  const rows = details.map(row => ({
    patientId: row.patientId, patientName: row.patient.fullName, programType: row.programType,
    periodMonths: row.periodMonths, amountPaid: row.amountPaid, attributionDate: row.decidedAt.toISOString(),
    startDate: row.startDate?.toISOString() ?? null, endDate: row.endDate?.toISOString() ?? null, notes: row.notes,
  }));
  rows.sort((a, b) => a.attributionDate.localeCompare(b.attributionDate));
  return NextResponse.json({ renewals: rows });
}
