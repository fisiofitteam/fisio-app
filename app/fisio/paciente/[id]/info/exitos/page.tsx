import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientEvidenceLibrary } from "@/components/PatientEvidenceLibrary";
import { AssessmentMaterial } from "@/components/AssessmentMaterial";
import { ConvertToCaseBlock } from "@/components/ConvertToCaseBlock";
export default async function PatientSuccessPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({ where: { id: params.id }, select: { id: true, fullName: true, diagnosis: true } });
  if (!patient) notFound();
  const cases = await prisma.clinicalCase.findMany({
    where: { patientId: patient.id },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: { id: true, shortSummary: true, achievements: true, initialSituation: true, updatedAt: true },
  });
  return <div className="space-y-4">
    {cases.length ? cases.map(c => <ConvertToCaseBlock key={c.id}
      patient={{ ...patient, diagnosis: patient.diagnosis || "" }}
      savedCase={{ id: c.id, summary: (c.shortSummary || c.achievements || c.initialSituation || "").slice(0, 300), updatedAt: c.updatedAt.toISOString() }} />)
      : <ConvertToCaseBlock patient={{ ...patient, diagnosis: patient.diagnosis || "" }} />}

    <AssessmentMaterial patientId={params.id} />
    <PatientEvidenceLibrary patientId={params.id} />
  </div>;
}
