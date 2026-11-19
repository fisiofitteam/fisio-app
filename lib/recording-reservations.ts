import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { recordingInput, RECORDING_PREFIX } from "@/lib/recording-rules";
import { requireRecordingProfessional, recordingToken, RecordingError } from "@/lib/recordings";
import { optionalRecordingId, ownedRecordingFolder } from "@/lib/recording-folders";
export async function reserveRecording(value: unknown, fixedPatientId?: string) {
  const actor = await requireRecordingProfessional();
  const input = value as Record<string, unknown> | null;
  const patientId = fixedPatientId || optionalRecordingId(input?.patientId);
  if (patientId && !await canAccessEvidencePatient(patientId, actor)) throw new RecordingError(403, "No tienes acceso a este paciente.");
  const folderId = optionalRecordingId(input?.folderId);
  if (folderId) await ownedRecordingFolder(folderId, actor.id);
  recordingToken();
  let data;
  try { data = recordingInput(value); } catch (e) { throw new RecordingError(400, e instanceof Error ? e.message : "Datos incorrectos."); }
  const pathname = RECORDING_PREFIX + randomUUID() + "." + (data.mime === "video/mp4" ? "mp4" : "webm");
  const row = await prisma.patientRecording.create({ data: {
    ...data, patientId, createdById: actor.id, blobPath: pathname, status: "uploading", pendingUntil: new Date(Date.now() + 3600000),
    ...(folderId ? { folderEntries: { create: { professionalId: actor.id, folderId } } } : {}),
  } });
  return { id: row.id, pathname };
}
