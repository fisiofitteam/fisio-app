import { NextRequest, NextResponse } from "next/server";
import { checkRecordingOrigin, requireRecording, finishRecording, deleteRecording, RecordingError, recordingFailure } from "@/lib/recordings";
export async function POST(req: NextRequest, { params }: { params: { recordingId: string } }) {
  try {
    checkRecordingOrigin(req);
    const { row, actor } = await requireRecording(params.recordingId);
    if (row.createdById !== actor.id || !row.blobPath) throw new RecordingError(403, "No puedes finalizar esta grabación.");
    if (!await finishRecording(row.id, row.blobPath)) throw new RecordingError(409, "La subida ha caducado. Vuelve a guardar el vídeo.");
    return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return recordingFailure(e); }
}
export async function DELETE(req: NextRequest, { params }: { params: { recordingId: string } }) {
  try {
    checkRecordingOrigin(req);
    await deleteRecording(params.recordingId);
    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return recordingFailure(e); }
}
