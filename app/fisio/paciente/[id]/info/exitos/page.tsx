import { PatientEvidenceLibrary } from "@/components/PatientEvidenceLibrary";
export default function PatientSuccessPage({ params }: { params: { id: string } }) {
  return <PatientEvidenceLibrary patientId={params.id} />;
}
