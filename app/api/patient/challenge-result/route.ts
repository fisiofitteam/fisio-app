import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";

// POST /api/patient/challenge-result — el paciente envía o actualiza su resultado.
// body: { challengeId, value, unit?, notes? }
export async function POST(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const challengeId = typeof b?.challengeId === "string" ? b.challengeId : "";
  const value = typeof b?.value === "string" ? b.value.trim() : "";
  if (!challengeId || !value) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  const saved = await prisma.monthlyChallengeResult.upsert({
    where: { challengeId_patientId: { challengeId, patientId: patient.id } },
    create: {
      challengeId, patientId: patient.id, value,
      unit: typeof b?.unit === "string" && b.unit.trim() ? b.unit.trim() : null,
      notes: typeof b?.notes === "string" && b.notes.trim() ? b.notes.trim() : null,
      recordedAt: new Date(),
    },
    update: {
      value,
      unit: typeof b?.unit === "string" && b.unit.trim() ? b.unit.trim() : null,
      notes: typeof b?.notes === "string" && b.notes.trim() ? b.notes.trim() : null,
      recordedAt: new Date(),
    },
  });
  return NextResponse.json(saved);
}

// DELETE /api/patient/challenge-result?id=xxx — borrar el propio resultado
export async function DELETE(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  const result = await prisma.monthlyChallengeResult.findUnique({ where: { id } });
  if (!result || result.patientId !== patient.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.monthlyChallengeResult.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
