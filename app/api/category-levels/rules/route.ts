/**
 * CRUD de reglas (regla = qué le pasa a un movimiento en un nivel de categoría).
 *
 * PUT { categoryLevelId, movementId, state, loadConstraint?, substitutionText?, physioWarning? }
 *   → upsert.
 *
 * DELETE ?categoryLevelId=&movementId=
 *   → quita la regla. Movimiento queda OK por defecto.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function forbidden() { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !user.isManager) return forbidden();
  const data = await req.json().catch(() => ({}));
  const categoryLevelId = typeof data?.categoryLevelId === "string" ? data.categoryLevelId : "";
  const movementId = typeof data?.movementId === "string" ? data.movementId : "";
  const stateIn = typeof data?.state === "string" ? data.state.toUpperCase() : "";
  if (!categoryLevelId || !movementId) {
    return NextResponse.json({ error: "categoryLevelId y movementId requeridos" }, { status: 400 });
  }
  if (!["OK", "CONDITIONAL", "BLOCKED"].includes(stateIn)) {
    return NextResponse.json({ error: "state debe ser OK | CONDITIONAL | BLOCKED" }, { status: 400 });
  }
  const payload = {
    state: stateIn,
    loadConstraint: data.loadConstraint ? String(data.loadConstraint) : null,
    substitutionText: data.substitutionText ? String(data.substitutionText) : null,
    physioWarning: data.physioWarning ? String(data.physioWarning) : null,
  };
  const rule = await prisma.categoryLevelRule.upsert({
    where: { categoryLevelId_movementId: { categoryLevelId, movementId } },
    create: { categoryLevelId, movementId, ...payload },
    update: payload,
  });
  return NextResponse.json({ rule });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !user.isManager) return forbidden();
  const categoryLevelId = req.nextUrl.searchParams.get("categoryLevelId");
  const movementId = req.nextUrl.searchParams.get("movementId");
  if (!categoryLevelId || !movementId) {
    return NextResponse.json({ error: "categoryLevelId y movementId requeridos" }, { status: 400 });
  }
  await prisma.categoryLevelRule.deleteMany({ where: { categoryLevelId, movementId } });
  return NextResponse.json({ ok: true });
}
