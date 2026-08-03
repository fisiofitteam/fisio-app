/**
 * POST /api/carousel-maker/upload — sube una imagen (PNG/JPG/SVG) a Vercel
 * Blob y devuelve la URL pública. La usa el editor visual para:
 *   - PNG del logo del user
 *   - Fotos a insertar en el canvas del carrusel
 *
 * Body: form-data con campo "file". Máximo 10 MB.
 * Response: { url, name, size }.
 */
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "El almacenamiento aún no está activado. Activa 'Blob' en Vercel." },
      { status: 503 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Archivo no válido." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Máximo 10 MB." }, { status: 400 });
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Solo imágenes (PNG, JPG, SVG…)." }, { status: 400 });
  }

  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const key = `carousel-maker/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${cleanName}`;

  try {
    const blob = await put(key, file, { access: "public", contentType: file.type || undefined });
    return NextResponse.json({ url: blob.url, name: file.name, size: file.size });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "No se pudo subir." }, { status: 500 });
  }
}
