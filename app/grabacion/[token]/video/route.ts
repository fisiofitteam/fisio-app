import { sharedRecording, recordingToken } from "@/lib/recordings";
import { recordingBlobUrl } from "@/lib/recording-rules";
import { serveAssessmentMedia, mediaFailure } from "@/lib/assessment-media";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
async function deliver(req: Request, token: string, headOnly: boolean) {
  const row = await sharedRecording(token);
  const url = row?.url && row.blobPath ? recordingBlobUrl(row.url, row.blobPath) : null;
  if (!row || !url) return mediaFailure(404);
  return serveAssessmentMedia(req, url, recordingToken(), headOnly, false, '"' + row.id + '"');
}
export function GET(req: Request, { params }: { params: { token: string } }) { return deliver(req, params.token, false); }
export function HEAD(req: Request, { params }: { params: { token: string } }) { return deliver(req, params.token, true); }
