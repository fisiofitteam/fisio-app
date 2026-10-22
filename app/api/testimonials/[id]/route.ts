import { NextRequest, NextResponse } from "next/server";
import { head } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { canAccessEvidence, canAccessEvidencePatient } from "@/lib/patient-evidence";
import { validEvidenceZone } from "@/lib/evidence-zones";
export const dynamic = "force-dynamic";
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const row = await prisma.patientEvidence.findUnique({ where: { id: params.id } });
  if (!row || row.status === "deleted" || !await canAccessEvidence(row)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (row.kind !== "whatsapp") return NextResponse.json({ error: "No es un TXT" }, { status: 400 });
  return new NextResponse(row.textContent || "", { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": "attachment; filename=conversacion.txt", "Cache-Control": "private, no-store" } });
}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const row = await prisma.patientEvidence.findUnique({ where: { id: params.id } });
  if (!row || row.status === "deleted" || !await canAccessEvidence(row)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  if (Object.prototype.hasOwnProperty.call(b, "bodyZone")) {
    if (!validEvidenceZone(b.bodyZone)) return NextResponse.json({ error: "Zona no válida" }, { status: 400 });
    const result = await prisma.patientEvidence.updateMany({ where: { id: row.id, patientId: row.patientId, status: "ready" }, data: { bodyZone: b.bodyZone } });
    if (!result.count) return NextResponse.json({ error: "El archivo ha cambiado. Recarga la lista." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  if (Object.prototype.hasOwnProperty.call(b, "patientId")) {
    if (row.status !== "ready") return NextResponse.json({ error: "Espera a que termine la subida" }, { status: 409 });
    if (typeof b.patientId !== "string" || !b.patientId || !await canAccessEvidencePatient(b.patientId))
      return NextResponse.json({ error: "Cliente no disponible" }, { status: 403 });
    const result = await prisma.patientEvidence.updateMany({
      where: { id: row.id, patientId: row.patientId, status: "ready" }, data: { patientId: b.patientId },
    });
    if (!result.count) return NextResponse.json({ error: "Otro miembro ha actualizado este archivo. Recarga la lista." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  if (row.status === "ready") return NextResponse.json({ ok: true });
  try {
    const pathname = "testimonials/" + row.id + "/" + row.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    // Look up our own pathname, never fetch a client-controlled URL.
    const blob = await head(pathname);
    if (blob.url !== b.url || blob.size !== row.size || blob.contentType !== row.mimeType) throw new Error("El archivo no coincide");
    await prisma.patientEvidence.updateMany({ where: { id: row.id, status: "pending" }, data: { url: blob.url, status: "ready" } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo confirmar la subida. Vuelve a cargar la lista en unos segundos." }, { status: 400 });
  }
}


// Retire from the library without breaking media already used in published cases.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const row = await prisma.patientEvidence.findUnique({ where: { id: params.id } });
  if (!row || !await canAccessEvidence(row)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const result = await prisma.patientEvidence.updateMany({ where: { id: row.id, patientId: row.patientId, status: "ready" }, data: { status: "deleted" } });
  if (!result.count && row.status !== "deleted") return NextResponse.json({ error: "El archivo ha cambiado. Recarga la lista." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
