import { NextResponse } from "next/server";
import { requireRecording, RecordingError, recordingFailure } from "@/lib/recordings";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: { recordingId: string } }) {
  try {
    const { row } = await requireRecording(params.recordingId);
    if (row.status !== "ready") throw new RecordingError(404, "Grabación no disponible.");
    return NextResponse.json({ transcript: row.transcript || "", status: row.transcriptionStatus }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return recordingFailure(e); }
}
