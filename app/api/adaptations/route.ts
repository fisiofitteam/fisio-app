import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { patientId, movementId, state, substitutionText, loadConstraint, physioWarning } = body;

  const result = await prisma.patientAdaptation.upsert({
    where: { patientId_movementId: { patientId, movementId } },
    update: {
      state,
      substitutionText: substitutionText || null,
      loadConstraint: loadConstraint || null,
      physioWarning: physioWarning || null,
    },
    create: {
      patientId,
      movementId,
      state,
      substitutionText: substitutionText || null,
      loadConstraint: loadConstraint || null,
      physioWarning: physioWarning || null,
    },
  });

  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const patientId = req.nextUrl.searchParams.get("patientId");
  const movementId = req.nextUrl.searchParams.get("movementId");
  if (!patientId || !movementId) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }
  await prisma.patientAdaptation.deleteMany({
    where: { patientId, movementId },
  });
  return NextResponse.json({ ok: true });
}
