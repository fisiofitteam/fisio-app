/**
 * POST /api/carousel-maker/upload — subida DIRECTA cliente → Vercel Blob.
 * Devuelve el token firmado que el cliente usa para subir sin pasar por
 * el runtime de la función (evita el límite de 4.5 MB que tienen las
 * funciones serverless). El cliente llama con @vercel/blob/client.
 */
import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "El almacenamiento no está activado (Blob en Vercel)." },
      { status: 503 },
    );
  }

  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        const user = await getActiveProfessional();
        if (!user || !canManage(user.role)) throw new Error("Forbidden");
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/svg+xml",
            "image/heic",
          ],
          maximumSizeInBytes: 25 * 1024 * 1024, // 25 MB — sobra para fotos de móvil
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // La URL se devuelve al cliente al terminar la subida directa.
      },
    });
    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo subir el archivo" }, { status: 400 });
  }
}
