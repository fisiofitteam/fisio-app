/**
 * GET /api/team-monthly-reports/window
 *
 * Decide si al profesional autenticado le toca ver el banner del
 * reporte mensual. `pending: true` únicamente si:
 *   1. Su rol está en REPORTING_ROLES (head_success / fisio).
 *   2. Ya llegó el primer lunes del mes actual (en TZ Madrid).
 *   3. No hay TeamMonthlyReport suyo en el mes actual.
 *
 * Silencioso (pending:false) si la tabla no existe todavía.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { isReportingWindowOpen, monthKey, monthLabel, shouldSubmitReport } from "@/lib/team-monthly-reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ pending: false });
  if (!shouldSubmitReport(user.role)) return NextResponse.json({ pending: false });
  if (!isReportingWindowOpen()) return NextResponse.json({ pending: false });

  const mk = monthKey();
  try {
    const row = await prisma.teamMonthlyReport.findUnique({
      where: { professionalId_monthYear: { professionalId: user.id, monthYear: mk } },
      select: { id: true },
    });
    if (row) return NextResponse.json({ pending: false });
    return NextResponse.json({
      pending: true,
      monthLabel: monthLabel(mk),
      href: "/fisio/biblioteca/reporte-mensual",
    });
  } catch {
    return NextResponse.json({ pending: false });
  }
}
