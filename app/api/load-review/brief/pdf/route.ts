/**
 * Sube/borra el PDF adjunto al brief de control de cargas IA.
 *
 * POST  multipart con "file" → sube a Vercel Blob + persiste URL en LoadReviewBrief.
 * DELETE → borra la referencia (no borra el blob físico, queda huérfano).
 *
 * Solo managers.
 */
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isManager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob no configurado en Vercel" }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo no válido" }, { status: 400 });
  }
  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) return NextResponse.json({ error: "Debe ser un PDF" }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "Máximo 25 MB" }, { status: 400 });
  }

  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const key = `load-review-briefs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${cleanName}`;
  let blobUrl: string;
  try {
    const blob = await put(key, file, { access: "public", contentType: "application/pdf" });
    blobUrl = blob.url;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "No se pudo subir" }, { status: 500 });
  }

  const brief = await prisma.loadReviewBrief.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", briefPdfUrl: blobUrl, briefPdfName: file.name, briefPdfSize: file.size, updatedById: user.id },
    update: { briefPdfUrl: blobUrl, briefPdfName: file.name, briefPdfSize: file.size, updatedById: user.id },
  });
  return NextResponse.json({ ok: true, brief: { briefPdfUrl: brief.briefPdfUrl, briefPdfName: brief.briefPdfName, briefPdfSize: brief.briefPdfSize } });
}

export async function DELETE() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isManager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.loadReviewBrief.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: { briefPdfUrl: null, briefPdfName: null, briefPdfSize: null, updatedById: user.id },
  });
  return NextResponse.json({ ok: true });
}
