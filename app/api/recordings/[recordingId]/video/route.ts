import { NextRequest } from "next/server";
import { requireRecording, recordingToken, recordingFailure, RecordingError } from "@/lib/recordings";
import { recordingBlobUrl } from "@/lib/recording-rules";
import { serveAssessmentMedia } from "@/lib/assessment-media";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
async function deliver(req: NextRequest, id: string, headOnly: boolean) {
  try {
    const { row } = await requireRecording(id);
    const url = row.url && row.blobPath ? recordingBlobUrl(row.url, row.blobPath) : null;
    if (row.status !== "ready" || !url) throw new RecordingError(404, "Grabación no disponible.");
    return serveAssessmentMedia(req, url, recordingToken(), headOnly, false, '"' + row.id + '"');
  } catch (e) { return recordingFailure(e); }
}
export function GET(req: NextRequest, { params }: { params: { recordingId: string } }) { return deliver(req, params.recordingId, false); }
export function HEAD(req: NextRequest, { params }: { params: { recordingId: string } }) { return deliver(req, params.recordingId, true); }
