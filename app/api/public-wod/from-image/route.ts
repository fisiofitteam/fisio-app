import { NextRequest } from "next/server";
import { readWodImage, WodImageError } from "@/lib/wod-image";
import { PublicWodError, failure, json, rateLimit, requireOrigin, requireProfile } from "@/lib/public-wod/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req); const profile = await requireProfile();
    await rateLimit(req, "image-profile", 12, 3600, profile.id);
    await rateLimit(req, "image-ip", 30, 3600);
    if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) throw new PublicWodError(415, "Envía una imagen.");
    const reader = req.body?.getReader(); if (!reader) throw new PublicWodError(400, "Falta la imagen.");
    const parts: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 3 * 1024 * 1024 + 16384) { await reader.cancel(); throw new PublicWodError(413, "La imagen supera los 3 MB."); }
      parts.push(value);
    }
    const form = await new Request(req.url, { method: "POST", headers: { "content-type": req.headers.get("content-type")! }, body: Buffer.concat(parts) }).formData();
    const image = form.get("image");
    if (!(image instanceof Blob) || image.size > 3 * 1024 * 1024) throw new PublicWodError(400, "Elige una imagen de hasta 3 MB.");
    // Image is processed transiently by the existing provider, never stored in public Blob.
    return json({ text: await readWodImage(image) });
  } catch (e) { return e instanceof WodImageError ? json({ error: e.message }, e.status) : failure(e); }
}
