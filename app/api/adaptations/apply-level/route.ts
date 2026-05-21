import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { patientId, levelId } = await req.json();
  if (!patientId || !levelId) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  // Obtenemos las reglas del nivel
  const rules = await prisma.clinicalLevelRule.findMany({
    where: { levelId },
  });

  // Borramos adaptaciones actuales
  await prisma.patientAdaptation.deleteMany({ where: { patientId } });

  // Insertamos las nuevas a partir de las reglas del nivel
  const created = [];
  for (const r of rules) {
    const adapt = await prisma.patientAdaptation.create({
      data: {
        patientId,
        movementId: r.movementId,
        state: r.state,
        substitutionText: r.substitutionText,
        loadConstraint: r.loadConstraint,
        physioWarning: r.physioWarning,
      },
    });
    created.push(adapt);
  }

  // Actualizamos el nivel aplicado en el paciente
  await prisma.patient.update({
    where: { id: patientId },
    data: { appliedLevelId: levelId },
  });

  return NextResponse.json({ ok: true, adaptations: created });
}
