import { canAccessRecordingRow } from "@/lib/recording-access";
import { randomBytes, createHash } from "crypto";
import { head, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { recordingBlobUrl, validRecordingShare } from "@/lib/recording-rules";

export class RecordingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function recordingToken() {
  const token = process.env.RECORDINGS_BLOB_READ_WRITE_TOKEN || process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN;
  if (!token) throw new RecordingError(503, "El almacenamiento privado de grabaciones no está configurado.");
  return token;
}
export function checkRecordingOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) throw new RecordingError(403, "Origen no permitido.");
}
export function recordingFailure(e: unknown) {
  return NextResponse.json({ error: e instanceof RecordingError ? e.message : "No se pudo completar la operación. Inténtalo de nuevo." },
    { status: e instanceof RecordingError ? e.status : 500, headers: { "Cache-Control": "private, no-store" } });
}
export async function requireRecordingProfessional() {
  const actor = await getActiveProfessional();
  if (!actor) throw new RecordingError(403, "Solo el equipo puede acceder a las grabaciones.");
  return actor;
}
export async function requireRecordingPatient(patientId: string) {
  const actor = await getActiveProfessional();
  if (!actor || !await canAccessEvidencePatient(patientId, actor)) throw new RecordingError(403, "No tienes acceso a estas grabaciones.");
  return actor;
}
export async function requireRecording(id: string) {
  const row = await prisma.patientRecording.findUnique({ where: { id } });
  if (!row) throw new RecordingError(404, "Grabación no disponible.");
  const actor = await requireRecordingProfessional();
  if (!await canAccessRecordingRow(row, actor)) throw new RecordingError(403, "No tienes acceso a esta grabación.");
  return { row, actor };
}
export async function finishRecording(id: string, pathname: string) {
  const row = await prisma.patientRecording.findUnique({ where: { id } });
  if (!row || row.blobPath !== pathname || row.status === "deleting") return false;
  if (row.status === "ready") return true;
  if (!row.pendingUntil || row.pendingUntil < new Date()) return false;
  // The path comes from our upload reservation, never a caller-supplied URL.
  const blob = await head(row.blobPath!, { token: recordingToken() });
  if (blob.pathname !== row.blobPath || blob.size !== row.size || blob.contentType !== row.mime || !recordingBlobUrl(blob.url, row.blobPath!))
    throw new RecordingError(409, "El archivo subido no coincide con la grabación.");
  const result = await prisma.patientRecording.updateMany({
    where: { id, blobPath: pathname, status: "uploading" },
    data: { url: blob.url, status: "ready", pendingUntil: null },
  });
  if (result.count > 0) return true;
  // The signed callback and browser confirmation can finalize concurrently.
  const current = await prisma.patientRecording.findUnique({ where: { id } });
  return current?.status === "ready" && current.blobPath === pathname;
}
export async function deleteRecording(id: string) {
  const { row } = await requireRecording(id);
  // Revoke playback before touching storage; retry remains possible if deletion fails.
  await prisma.patientRecording.update({ where: { id }, data: { status: "deleting", shareTokenHash: null, shareExpiresAt: null } });
  if (row.blobPath) await del(row.blobPath, { token: recordingToken() });
  await prisma.patientRecording.deleteMany({ where: { id, status: "deleting" } });
}
export function newRecordingShare() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: recordingShareHash(token), expires: new Date(Date.now() + 30 * 86400000) };
}
export function recordingShareHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export async function sharedRecording(token: string) {
  if (!validRecordingShare(token)) return null;
  return prisma.patientRecording.findFirst({
    where: { shareTokenHash: recordingShareHash(token), shareExpiresAt: { gt: new Date() }, status: "ready" },
    select: { id: true, title: true, url: true, blobPath: true },
  });
}
