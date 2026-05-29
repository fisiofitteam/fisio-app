import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";

// GET /api/patient/prs — lista los PRs del paciente.
export async function GET() {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const prs = await prisma.patientPR.findMany({
    where: { patientId: patient.id },
    orderBy: { recordedAt: "desc" },
  });
  return NextResponse.json(prs);
}

// POST /api/patient/prs — añade un PR. body: { name, value, unit?, notes?, recordedAt? }
export async function POST(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const name = typeof b?.name === "string" ? b.name.trim() : "";
  const value = typeof b?.value === "string" ? b.value.trim() : "";
  if (!name || !value) {
    return NextResponse.json({ error: "Nombre y marca son obligatorios" }, { status: 400 });
  }

  const created = await prisma.patientPR.create({
    data: {
      patientId: patient.id,
      name,
      value,
      unit: typeof b?.unit === "string" && b.unit.trim() ? b.unit.trim() : null,
      notes: typeof b?.notes === "string" && b.notes.trim() ? b.notes.trim() : null,
      recordedAt: b?.recordedAt ? new Date(b.recordedAt) : new Date(),
    },
  });
  return NextResponse.json(created);
}

// DELETE /api/patient/prs?id=xxx
export async function DELETE(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  // Solo puede borrar los suyos
  const pr = await prisma.patientPR.findUnique({ where: { id } });
  if (!pr || pr.patientId !== patient.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.patientPR.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
