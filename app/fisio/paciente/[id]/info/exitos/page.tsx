import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientEvidenceLibrary } from "@/components/PatientEvidenceLibrary";
import { ConvertToCaseBlock } from "@/components/ConvertToCaseBlock";
export default async function PatientSuccessPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({ where: { id: params.id }, select: { id: true, fullName: true, diagnosis: true } });
  if (!patient) notFound();
  return <div className="space-y-4">
    <ConvertToCaseBlock patient={{ ...patient, diagnosis: patient.diagnosis || "" }} />
    <PatientEvidenceLibrary patientId={params.id} />
  </div>;
}
