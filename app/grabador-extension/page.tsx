import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { evidencePatientScope } from "@/lib/patient-evidence";
import { getRecordingFolders } from "@/lib/recording-folders";
import { ExtensionRecordingImport } from "@/components/ExtensionRecordingImport";
export const dynamic = "force-dynamic";
export default async function ExtensionImportPage() {
  const actor = await getActiveProfessional();
  const scope = actor ? evidencePatientScope(actor) : null;
  const [patients, folders] = actor ? await Promise.all([
    scope ? prisma.patient.findMany({ where: scope, orderBy: [{ fullName: "asc" }, { id: "asc" }], select: { id: true, fullName: true } }) : Promise.resolve([]),
    getRecordingFolders(actor.id),
  ]) : [[], []];
  return <ExtensionRecordingImport actor={actor ? { id: actor.id, fullName: actor.fullName } : null} patients={patients} folders={folders} />;
}
