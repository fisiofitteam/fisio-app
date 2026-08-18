import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { generateSummaryForPatientCall } from "@/lib/patient-call-summaries";

/**
 * POST /api/patient-calls/[id]/regenerate
 *
 * Regenera manualmente el resumen IA de una llamada de paciente. Útil cuando
 * el transcript llegó tarde a Meet o queremos re-lanzar tras haber tocado
 * el prompt. Solo el fisio asignado (o CEO/head_success) puede regenerar.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const call = await prisma.patientCall.findUnique({
    where: { id: params.id },
    select: { id: true, professionalId: true, patient: { select: { assignedProfessionalId: true } } },
  });
  if (!call) return NextResponse.json({ error: "Llamada no encontrada" }, { status: 404 });

  const isManager = user.role === "ceo" || user.role === "head_success";
  const isOwnerFisio = call.professionalId === user.id || call.patient.assignedProfessionalId === user.id;
  if (!isManager && !isOwnerFisio) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const result = await generateSummaryForPatientCall(call.id, { force: true });
  return NextResponse.json(result);
}
