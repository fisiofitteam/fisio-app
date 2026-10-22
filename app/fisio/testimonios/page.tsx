import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { canUseEvidence } from "@/lib/patient-evidence";
import { PatientEvidenceLibrary } from "@/components/PatientEvidenceLibrary";
export default async function TestimonialsPage() {
  if (!canUseEvidence(await getActiveProfessional())) redirect("/fisio");
  return <PatientEvidenceLibrary />;
}
