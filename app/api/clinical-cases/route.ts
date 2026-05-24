import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

const STATUSES = ["pendiente", "supervision", "resuelto"];

// GET /api/clinical-cases — lista de casos (todo el equipo).
export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cases = await prisma.clinicalSessionCase.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(cases);
}

// POST /api/clinical-cases — crea un caso.
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const patientName = typeof b?.patientName === "string" ? b.patientName.trim() : "";
  if (!patientName) return NextResponse.json({ error: "Nombre del paciente requerido" }, { status: 400 });

  const created = await prisma.clinicalSessionCase.create({
    data: {
      patientName,
      assignedToId: b.assignedToId || null,
      status: STATUSES.includes(b.status) ? b.status : "pendiente",
      bodyZone: b.bodyZone?.trim() || null,
      situation: b.situation?.trim() || null,
      proposedSolutions: b.proposedSolutions?.trim() || null,
      consensusSolution: b.consensusSolution?.trim() || null,
      createdById: user.id,
    },
  });
  return NextResponse.json(created);
}

// PATCH /api/clinical-cases — edita un caso.
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b?.id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const data: any = {};
  if (b.patientName !== undefined) data.patientName = String(b.patientName).trim();
  if (b.assignedToId !== undefined) data.assignedToId = b.assignedToId || null;
  if (b.status !== undefined && STATUSES.includes(b.status)) data.status = b.status;
  if (b.bodyZone !== undefined) data.bodyZone = b.bodyZone?.trim() || null;
  if (b.situation !== undefined) data.situation = b.situation?.trim() || null;
  if (b.proposedSolutions !== undefined) data.proposedSolutions = b.proposedSolutions?.trim() || null;
  if (b.consensusSolution !== undefined) data.consensusSolution = b.consensusSolution?.trim() || null;

  const updated = await prisma.clinicalSessionCase.update({ where: { id: b.id }, data });
  return NextResponse.json(updated);
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
