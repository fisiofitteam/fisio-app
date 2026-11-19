import { NextResponse } from "next/server";
import { checkRecordingOrigin, RecordingError } from "@/lib/recordings";
import { moveRecordingToFolder, recordingFolderFailure } from "@/lib/recording-folders";
export async function PATCH(req: Request, { params }: { params: { recordingId: string } }) {
  try {
    checkRecordingOrigin(req); const body = await req.json();
    if (!body || typeof body !== "object" || !Object.prototype.hasOwnProperty.call(body, "folderId")) throw new RecordingError(400, "Selecciona una carpeta o Sin carpeta.");
    await moveRecordingToFolder(params.recordingId, body.folderId);
    return NextResponse.json({ moved: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return recordingFolderFailure(e); }
}
