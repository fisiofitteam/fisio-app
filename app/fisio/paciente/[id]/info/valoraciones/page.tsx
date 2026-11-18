import { PatientAssessments } from "@/components/PatientAssessments";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { redirect } from "next/navigation";

export default async function PatientValoracionesTab({ params }: { params: { id: string } }) {
  if (!await canAccessEvidencePatient(params.id)) redirect("/fisio/pacientes");

  return <PatientAssessments patientId={params.id} />;
}
