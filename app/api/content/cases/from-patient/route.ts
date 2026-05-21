import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { patientId, insight, consentSigned, videoUrls, notes } = await req.json();
  if (!patientId) return NextResponse.json({ error: "patientId requerido" }, { status: 400 });

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });

  // ¿Ya existe un caso para este paciente? Si sí, lo actualizamos
  const existing = await prisma.clinicalCase.findFirst({ where: { patientId } });

  if (existing) {
    const updated = await prisma.clinicalCase.update({
      where: { id: existing.id },
      data: {
        insight: insight || existing.insight,
        consentSigned: consentSigned !== undefined ? !!consentSigned : existing.consentSigned,
        consentSignedAt: consentSigned && !existing.consentSigned ? new Date() : existing.consentSignedAt,
        videoUrls: videoUrls !== undefined ? JSON.stringify(videoUrls) : existing.videoUrls,
        notes: notes !== undefined ? (notes || null) : existing.notes,
      },
    });
    return NextResponse.json({ ok: true, caseId: updated.id, updated: true });
  }

  const created = await prisma.clinicalCase.create({
    data: {
      patientId,
      athleteName: patient.fullName,
      injury: patient.diagnosis ?? "Sin diagnóstico",
      insight: insight || null,
      consentSigned: !!consentSigned,
      consentSignedAt: consentSigned ? new Date() : null,
      videoUrls: JSON.stringify(videoUrls ?? []),
      notes: notes || null,
    },
  });
  return NextResponse.json({ ok: true, caseId: created.id, updated: false });
}
