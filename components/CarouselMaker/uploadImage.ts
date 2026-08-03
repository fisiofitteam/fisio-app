"use client";

import { upload } from "@vercel/blob/client";

/**
 * Sube un File directamente a Vercel Blob (cliente → Blob) usando el
 * endpoint /api/carousel-maker/upload como firmador. Evita el límite de
 * 4.5 MB de las funciones serverless que tenía la versión anterior.
 *
 * Devuelve la URL pública del blob.
 */
export async function uploadCarouselImage(file: File): Promise<string> {
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const pathname = `carousel-maker/${Date.now()}-${cleanName}`;
  const blob = await upload(pathname, file, {
    access: "public",
    handleUploadUrl: "/api/carousel-maker/upload",
    contentType: file.type || undefined,
  });
  return blob.url;
}
