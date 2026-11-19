import { sharedRecording } from "@/lib/recordings";
export const dynamic = "force-dynamic";
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const row = await sharedRecording(params.token);
  const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
  if (!row?.url || !row.blobPath) return new Response("<!doctype html><html lang='es'><meta charset='utf-8'><meta name='viewport' content='width=device-width'><title>Grabación no disponible</title><p>Este enlace ha caducado o se ha desactivado.</p></html>", { status: 404, headers });
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(row.title)} · FisioFit</title><style>body{margin:0;background:#111;color:#fff;font-family:system-ui}main{max-width:1100px;margin:0 auto;padding:24px}h1{font-size:22px}video{width:100%;max-height:80vh;background:#000;border-radius:16px}small{color:#ccc}</style></head><body><main><small>FISIOFIT · GRABACIÓN COMPARTIDA</small><h1>${esc(row.title)}</h1><video controls playsinline preload="metadata" src="/grabacion/${params.token}/video"></video></main></body></html>`, { headers });
}
