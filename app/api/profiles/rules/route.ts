import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { levelId, movementId, state, substitutionText, loadConstraint, physioWarning } = await req.json();
  const rule = await prisma.clinicalLevelRule.upsert({
    where: { levelId_movementId: { levelId, movementId } },
    update: {
      state,
      substitutionText: substitutionText || null,
      loadConstraint: loadConstraint || null,
      physioWarning: physioWarning || null,
    },
    create: {
      levelId,
      movementId,
      state,
      substitutionText: substitutionText || null,
      loadConstraint: loadConstraint || null,
      physioWarning: physioWarning || null,
    },
  });
  return NextResponse.json(rule);
}

export async function DELETE(req: NextRequest) {
  const levelId = req.nextUrl.searchParams.get("levelId");
  const movementId = req.nextUrl.searchParams.get("movementId");
  if (!levelId || !movementId) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }
  await prisma.clinicalLevelRule.deleteMany({ where: { levelId, movementId } });
  return NextResponse.json({ ok: true });
}
