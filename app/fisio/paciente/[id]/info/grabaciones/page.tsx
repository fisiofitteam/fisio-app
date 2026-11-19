import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { capServerUrl } from "@/lib/cap-recordings";
import { PatientRecordings } from "@/components/PatientRecordings";
export const dynamic = "force-dynamic";
export default async function RecordingsPage({ params }: { params: { id: string } }) {
  if (!await canAccessEvidencePatient(params.id)) redirect("/fisio/pacientes");
  const recordings = await prisma.patientRecording.findMany({ where: { patientId: params.id }, orderBy: { createdAt: "desc" } });
  return <PatientRecordings patientId={params.id} serverUrl={capServerUrl()} recordings={recordings.map(r => ({ id: r.id, title: r.title, url: r.url, notes: r.notes, createdAt: r.createdAt.toISOString() }))} />;
}
