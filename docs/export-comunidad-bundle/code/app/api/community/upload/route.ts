import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCommunityActor } from "@/lib/community-actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/community/upload — subida directa a Vercel Blob (cliente → Blob) para
// adjuntar foto o vídeo a un post de la comunidad. Permite pacientes y profesionales.
// La subida directa evita el límite de tamaño de las funciones serverless (vídeos).
export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "El almacenamiento no está activado (Blob en Vercel)." }, { status: 503 });
  }

  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        const actor = await getCommunityActor();
        if (!actor) throw new Error("No autorizado");
        return {
          allowedContentTypes: [
            "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic",
            "video/mp4", "video/quicktime", "video/webm",
          ],
          maximumSizeInBytes: 80 * 1024 * 1024, // 80 MB (cubre vídeos cortos del móvil)
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // No-op: la URL se devuelve al cliente directamente.
      },
    });
    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo subir el archivo" }, { status: 400 });
  }
}
