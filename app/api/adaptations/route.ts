import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { materializePatientCategoryLevels } from "@/lib/materialize-category-levels";

/**
 * POST — el fisio guarda a mano una adaptación desde el editor. La marcamos
 * `isCustomized: true` para que futuros cambios de nivel del paciente NO la
 * pisen automáticamente.
 */
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
      isCustomized: true,
    },
    create: {
      patientId,
      movementId,
      state,
      substitutionText: substitutionText || null,
      loadConstraint: loadConstraint || null,
      physioWarning: physioWarning || null,
      isCustomized: true,
    },
  });

  return NextResponse.json(result);
}

/**
 * DELETE — "Restablecer al nivel". Borra la adaptación personalizada y
 * re-materializa las reglas de los niveles activos del paciente, así el
 * movimiento vuelve al default que le corresponde por su nivel de categoría
 * (o queda "OK" si ningún nivel lo cubre).
 */
export async function DELETE(req: NextRequest) {
  const patientId = req.nextUrl.searchParams.get("patientId");
  const movementId = req.nextUrl.searchParams.get("movementId");
  if (!patientId || !movementId) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }
  await prisma.patientAdaptation.deleteMany({
    where: { patientId, movementId },
  });
  // Re-aplicar reglas del nivel: si algún CategoryLevel del paciente cubre
  // este movimiento, se re-materializará; si no, queda "OK" implícito.
  await materializePatientCategoryLevels(patientId);
  return NextResponse.json({ ok: true });
}
