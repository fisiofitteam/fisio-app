import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { getActiveProfessional } from "@/lib/session";
import { PatientRecordings } from "@/components/PatientRecordings";
export const dynamic = "force-dynamic";
export default async function RecordingsPage({ params }: { params: { id: string } }) {
  const actor = await getActiveProfessional();
  if (!actor || !await canAccessEvidencePatient(params.id, actor)) redirect("/fisio/pacientes");
  const [recordings, patient] = await Promise.all([
    prisma.patientRecording.findMany({ where: { patientId: params.id, status: { in: ["ready", "deleting"] } }, orderBy: { createdAt: "desc" } }),
    prisma.patient.findUnique({ where: { id: params.id }, select: { fullName: true } }),
  ]);
  return <PatientRecordings professionalId={actor.id} patientId={params.id} patientName={patient?.fullName || ""} enabled={!!(process.env.RECORDINGS_BLOB_READ_WRITE_TOKEN || process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN)}
    recordings={recordings.map(r => ({ id: r.id, title: r.title, notes: r.notes, status: r.status, createdAt: r.createdAt.toISOString(), durationSeconds: r.durationSeconds, size: r.size, shared: !!r.shareTokenHash && !!r.shareExpiresAt && r.shareExpiresAt > new Date() }))} />;
}
