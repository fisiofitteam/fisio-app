/**
 * GET /api/patient-assignments?patientId=X
 * Lista los ProgramAssignments del paciente (activos e inactivos) con
 * datos mínimos del programa. Se usa desde PatientIndividualProgramPanel
 * en la ficha del paciente para mostrar el "trabajo específico".
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patientId = req.nextUrl.searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "patientId requerido" }, { status: 400 });

  const assignments = await prisma.programAssignment.findMany({
    where: { patientId },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    include: {
      program: { select: { id: true, name: true, type: true, level: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    assignments: assignments.map((a) => ({
      id: a.id,
      programId: a.programId,
      startDate: a.startDate.toISOString(),
      weeksCount: a.weeksCount,
      isActive: a.isActive,
      program: a.program,
    })),
  });
}
