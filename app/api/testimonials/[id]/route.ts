import { NextRequest, NextResponse } from "next/server";
import { head } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
export const dynamic = "force-dynamic";
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const row = await prisma.patientEvidence.findUnique({ where: { id: params.id } });
  if (!row || !await canAccessEvidencePatient(row.patientId)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (row.kind !== "whatsapp") return NextResponse.json({ error: "No es un TXT" }, { status: 400 });
  return new NextResponse(row.textContent || "", { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": "attachment; filename=conversacion.txt", "Cache-Control": "private, no-store" } });
}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const row = await prisma.patientEvidence.findUnique({ where: { id: params.id } });
  if (!row || !await canAccessEvidencePatient(row.patientId)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (row.status === "ready") return NextResponse.json({ ok: true });
  const b = await req.json().catch(() => ({}));
  try {
    const pathname = "testimonials/" + row.id + "/" + row.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    // Look up our own pathname, never fetch a client-controlled URL.
    const blob = await head(pathname);
    if (blob.url !== b.url || blob.size !== row.size || blob.contentType !== row.mimeType) throw new Error("El archivo no coincide");
    await prisma.patientEvidence.update({ where: { id: row.id }, data: { url: blob.url, status: "ready" } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo confirmar la subida. Vuelve a cargar la lista en unos segundos." }, { status: 400 });
  }
}
