import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRecordingOrigin, requireRecording, newRecordingShare, RecordingError, recordingFailure } from "@/lib/recordings";
export async function POST(req: NextRequest, { params }: { params: { recordingId: string } }) {
  try {
    checkRecordingOrigin(req);
    const { row } = await requireRecording(params.recordingId);
    if (row.status !== "ready" || !row.url || !row.blobPath) throw new RecordingError(409, "La grabación todavía no está disponible.");
    const share = newRecordingShare();
    const updated = await prisma.patientRecording.updateMany({ where: { id: row.id, status: "ready" }, data: { shareTokenHash: share.hash, shareExpiresAt: share.expires } });
    if (!updated.count) throw new RecordingError(409, "La grabación ya no está disponible.");
    return NextResponse.json({ path: "/grabacion/" + share.token, expiresAt: share.expires.toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return recordingFailure(e); }
}
export async function DELETE(req: NextRequest, { params }: { params: { recordingId: string } }) {
  try {
    checkRecordingOrigin(req);
    const { row } = await requireRecording(params.recordingId);
    await prisma.patientRecording.update({ where: { id: row.id }, data: { shareTokenHash: null, shareExpiresAt: null } });
    return NextResponse.json({ revoked: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return recordingFailure(e); }
}
