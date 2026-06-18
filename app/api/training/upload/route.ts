import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getActiveProfessional } from "@/lib/session";
import { canManageTraining } from "@/lib/training";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/training/upload — sube un PDF o imagen a Vercel Blob.
 * Body: form-data con campo "file". Devuelve { url, name, size, kind }.
 *
 * Solo CEO + Head-success (managers). Máximo 25 MB.
 */
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageTraining(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "El almacenamiento aún no está activado. Activa 'Blob' en Vercel." },
      { status: 503 },
    );
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo no válido" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Máximo 25 MB" }, { status: 400 });
  }

  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = file.type.startsWith("image/");
  if (!isPdf && !isImage) {
    return NextResponse.json({ error: "Solo PDFs o imágenes" }, { status: 400 });
  }
  const kind = isPdf ? "pdf" : "image";
  const folder = isPdf ? "training/pdfs" : "training/images";
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${cleanName}`;

  try {
    const blob = await put(key, file, { access: "public", contentType: file.type || undefined });
    return NextResponse.json({ url: blob.url, name: file.name, size: file.size, kind });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "No se pudo subir" }, { status: 500 });
  }
}
