import { prisma } from "@/lib/prisma";
import { PatientClinicalCasePanel } from "@/components/PatientClinicalCasePanel";

export const dynamic = "force-dynamic";

export default async function PatientClinicalSessionTab({ params }: { params: { id: string } }) {
  const c = await prisma.clinicalSessionCase.findUnique({
    where: { patientId: params.id },
    include: { patient: { select: { assignedProfessionalId: true, bodyZone: true } } },
  });

  if (!c) {
    return (
      <div className="card text-center py-12">
        <p className="text-sm text-neutral-500">Este paciente no está en ninguna sesión clínica todavía.</p>
        <p className="text-xs text-neutral-400 mt-1">Añádelo desde Reuniones → Sesiones clínicas.</p>
      </div>
    );
  }

  let fisioName = "Sin fisio asignado";
  if (c.patient.assignedProfessionalId) {
    const pro = await prisma.professional.findUnique({
      where: { id: c.patient.assignedProfessionalId },
      select: { fullName: true },
    });
    if (pro) fisioName = pro.fullName;
  }

  return (
    <PatientClinicalCasePanel
      caseData={{
        id: c.id,
        status: c.status,
        situation: c.situation,
        proposedSolutions: c.proposedSolutions,
        consensusSolution: c.consensusSolution,
      }}
      fisioName={fisioName}
      bodyZone={c.patient.bodyZone}
    />
  );
}
