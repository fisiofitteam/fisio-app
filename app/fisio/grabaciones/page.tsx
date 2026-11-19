import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { evidencePatientScope } from "@/lib/patient-evidence";
import { getRecordingFolders } from "@/lib/recording-folders";
import { getRecordingLibrary } from "@/lib/recording-library";
import { RecordingsLibrary } from "@/components/RecordingsLibrary";
export const dynamic = "force-dynamic";
export default async function RecordingsLibraryPage() {
  const actor = await getActiveProfessional(), scope = evidencePatientScope(actor);
  if (!actor) redirect("/fisio");
  const [initialData, patients, initialFolders] = await Promise.all([
    getRecordingLibrary(actor),
    scope ? prisma.patient.findMany({ where: scope, orderBy: [{ fullName: "asc" }, { id: "asc" }], select: { id: true, fullName: true } }) : Promise.resolve([]),
    getRecordingFolders(actor.id),
  ]);
  return <RecordingsLibrary initialFolders={initialFolders} initialData={initialData} patients={patients} professionalId={actor.id}
    enabled={!!(process.env.RECORDINGS_BLOB_READ_WRITE_TOKEN || process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN)} />;
}
