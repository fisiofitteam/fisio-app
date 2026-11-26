import { supportActor, supportJson } from "@/lib/support/http";
import { readableSupportFile, supportStorageToken } from "@/lib/support/materials";
import { SupportError } from "@/lib/support/errors";
import { serveAssessmentMedia } from "@/lib/assessment-media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
async function deliver(req: Request, id: string, headOnly: boolean) {
  try {
    const { row, url } = await readableSupportFile(await supportActor(), id);
    const download = new URL(req.url).searchParams.get("download") === "1" || !/^(image|video|audio)\//.test(row.mime);
    const response = await serveAssessmentMedia(req, url, supportStorageToken(), headOnly, download, '"' + row.id + '"');
    if (!response.ok) return response;
    const headers = new Headers(response.headers);
    headers.set("Content-Type", row.mime);
    headers.set("Content-Disposition", (download ? "attachment" : "inline") + "; filename*=UTF-8''" + encodeURIComponent(row.name).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16)));
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(response.body, { status: response.status, headers });
  } catch (error) { return supportJson({ error: "Adjunto no disponible." }, error instanceof SupportError ? error.status : 503); }
}
export function GET(req: Request, { params }: { params: { id: string } }) { return deliver(req, params.id, false); }
export function HEAD(req: Request, { params }: { params: { id: string } }) { return deliver(req, params.id, true); }
