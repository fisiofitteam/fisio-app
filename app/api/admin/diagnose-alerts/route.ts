/**
 * GET /api/admin/diagnose-alerts
 *   → devuelve las ultimas 20 PatientAlert TAL CUAL estan en BD, sin
 *     filtros de severity/seen/dismissed. Sirve para diagnosticar por
 *     que el badge y el buzon no coinciden.
 *
 * Solo CEO / head_success.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await (prisma as any).patientAlert.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      patient: {
        select: { id: true, fullName: true, assignedProfessionalId: true },
      },
    },
  });

  return NextResponse.json({
    count: raw.length,
    now: new Date().toISOString(),
    alerts: raw.map((a: any) => ({
      id: a.id,
      kind: a.kind,
      severity: a.severity,
      summary: a.summary,
      seenAt: a.seenAt,
      dismissedAt: a.dismissedAt,
      createdAt: a.createdAt,
      sourceType: a.sourceType,
      patient: a.patient
        ? { id: a.patient.id, fullName: a.patient.fullName, assignedProfessionalId: a.patient.assignedProfessionalId }
        : null,
    })),
  });
}
