import { prisma } from "@/lib/prisma";
import { RecordingError, recordingFailure, requireRecording } from "@/lib/recordings";
export function folderName(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80) throw new RecordingError(400, "Escribe un nombre de entre 1 y 80 caracteres.");
  return value.trim();
}
export function optionalRecordingId(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 100) throw new RecordingError(400, "La selección no es válida.");
  return value;
}
export async function ownedRecordingFolder(id: string, professionalId: string) {
  const folder = await prisma.recordingFolder.findFirst({ where: { id, professionalId }, select: { id: true, name: true } });
  if (!folder) throw new RecordingError(404, "Carpeta no disponible.");
  return folder;
}
export function getRecordingFolders(professionalId: string) {
  return prisma.recordingFolder.findMany({ where: { professionalId }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } });
}
export async function moveRecordingToFolder(id: string, value: unknown) {
  const { row, actor } = await requireRecording(id);
  if (row.status !== "ready") throw new RecordingError(409, "La grabación todavía no está disponible.");
  const folderId = optionalRecordingId(value);
  if (folderId) {
    await ownedRecordingFolder(folderId, actor.id);
    await prisma.recordingFolderEntry.upsert({
      where: { recordingId_professionalId: { recordingId: id, professionalId: actor.id } },
      create: { recordingId: id, professionalId: actor.id, folderId }, update: { folderId },
    });
  } else await prisma.recordingFolderEntry.deleteMany({ where: { recordingId: id, professionalId: actor.id } });
}
export function recordingFolderFailure(e: unknown) {
  return recordingFailure((e as { code?: string })?.code === "P2002" ? new RecordingError(409, "Ya tienes una carpeta con ese nombre.") : e);
}
