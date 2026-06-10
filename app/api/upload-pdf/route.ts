import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/upload-pdf — sube un PDF a Vercel Blob y devuelve su URL.
 *
 * Solo CEO. Máximo 25 MB. Pensado para documentos internos del equipo:
 * estrategias de contenido, contratos, etc.
 *
 * Body: form-data con campo "file" (PDF).
 * Devuelve: { url, name, size }
 */
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "El almacenamiento aún no está activado. Activa 'Blob' en Vercel." },
      { status: 503 }
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo no válido" }, { status: 400 });
  }
  // Aceptamos application/pdf y, por compat, extensión .pdf en el nombre
  const looksLikePdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    return NextResponse.json({ error: "Debe ser un PDF" }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "Máximo 25 MB" }, { status: 400 });
  }

  // Nombre seguro en el blob: preservar el nombre original para mostrarlo
  // luego en el link, pero con un prefijo único.
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const key = `pdfs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${cleanName}`;

  try {
    const blob = await put(key, file, { access: "public", contentType: "application/pdf" });
    return NextResponse.json({
      url: blob.url,
      name: file.name,
      size: file.size,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "No se pudo subir el PDF" }, { status: 500 });
  }
}
