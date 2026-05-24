import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

const STATUSES = ["pendiente", "supervision", "resuelto"];

// Forma de salida con datos derivados del paciente (fisio y zona)
function shape(c: any) {
  return {
    id: c.id,
    patientId: c.patientId,
    patientName: c.patient?.fullName ?? "",
    assignedToId: c.patient?.assignedProfessionalId ?? null,
    bodyZone: c.patient?.bodyZone ?? null,
    status: c.status,
    situation: c.situation,
    proposedSolutions: c.proposedSolutions,
    consensusSolution: c.consensusSolution,
  };
}

const patientSelect = { select: { fullName: true, assignedProfessionalId: true, bodyZone: true } };

// GET /api/clinical-cases — lista de casos (todo el equipo).
export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cases = await prisma.clinicalSessionCase.findMany({
    orderBy: { updatedAt: "desc" },
    include: { patient: patientSelect },
  });
  return NextResponse.json(cases.map(shape));
}

// POST /api/clinical-cases — crea un caso para un paciente (uno por paciente).
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const patientId = typeof b?.patientId === "string" ? b.patientId : "";
  if (!patientId) return NextResponse.json({ error: "Selecciona un paciente" }, { status: 400 });

  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });

  const existing = await prisma.clinicalSessionCase.findUnique({ where: { patientId } });
  if (existing) {
    return NextResponse.json(
      { error: "Este paciente ya está en sesiones clínicas.", existingId: existing.id },
      { status: 409 }
    );
  }

  const created = await prisma.clinicalSessionCase.create({
    data: {
      patientId,
      status: STATUSES.includes(b.status) ? b.status : "pendiente",
      situation: b.situation?.trim() || null,
      proposedSolutions: b.proposedSolutions?.trim() || null,
      consensusSolution: b.consensusSolution?.trim() || null,
      createdById: user.id,
    },
    include: { patient: patientSelect },
  });
  return NextResponse.json(shape(created));
}

// PATCH /api/clinical-cases — edita el contenido del caso (no el paciente).
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b?.id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const data: any = {};
  if (b.status !== undefined && STATUSES.includes(b.status)) data.status = b.status;
  if (b.situation !== undefined) data.situation = b.situation?.trim() || null;
  if (b.proposedSolutions !== undefined) data.proposedSolutions = b.proposedSolutions?.trim() || null;
  if (b.consensusSolution !== undefined) data.consensusSolution = b.consensusSolution?.trim() || null;

  const updated = await prisma.clinicalSessionCase.update({
    where: { id: b.id },
    data,
    include: { patient: patientSelect },
  });
  return NextResponse.json(shape(updated));
}

// DELETE /api/clinical-cases?id=xxx — borra un caso.
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await prisma.clinicalSessionCase.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
