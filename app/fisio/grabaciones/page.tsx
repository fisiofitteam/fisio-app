import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { evidencePatientScope } from "@/lib/patient-evidence";
import { getRecordingLibrary } from "@/lib/recording-library";
import { RecordingsLibrary } from "@/components/RecordingsLibrary";
export const dynamic = "force-dynamic";
export default async function RecordingsLibraryPage() {
  const actor = await getActiveProfessional(), scope = evidencePatientScope(actor);
  if (!actor || !scope) redirect("/fisio");
  const [initialData, patients] = await Promise.all([
    getRecordingLibrary(actor),
    prisma.patient.findMany({ where: scope, orderBy: [{ fullName: "asc" }, { id: "asc" }], select: { id: true, fullName: true } }),
  ]);
  return <RecordingsLibrary initialData={initialData} patients={patients} professionalId={actor.id}
    enabled={!!(process.env.RECORDINGS_BLOB_READ_WRITE_TOKEN || process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN)} />;
}
