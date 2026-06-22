/**
 * Preferencias personales del CEO (singleton por profesional).
 *
 * GET  /api/ceo/preferences         → upsert vacío y devuelve la fila.
 * PATCH /api/ceo/preferences        → body con campos a actualizar.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canUseCeoPersonal } from "@/lib/ceo-personal";

function forbidden() { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

async function getOrCreate(professionalId: string) {
  return prisma.ceoPreferences.upsert({
    where: { professionalId },
    create: { professionalId },
    update: {},
  });
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const prefs = await getOrCreate(user.id);
  return NextResponse.json({ prefs });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  await getOrCreate(user.id);

  const update: any = {};
  if (data.weeklyPlanDayOfWeek !== undefined) {
    const n = Number(data.weeklyPlanDayOfWeek);
    if (Number.isFinite(n) && n >= 1 && n <= 7) update.weeklyPlanDayOfWeek = n;
  }
  if (data.cooldownDays !== undefined) {
    const n = Number(data.cooldownDays);
    if (Number.isFinite(n) && n >= 1 && n <= 365) update.cooldownDays = n;
  }
  if (data.lastDayCloseAt !== undefined) update.lastDayCloseAt = data.lastDayCloseAt ? new Date(data.lastDayCloseAt) : null;
  if (data.lastWeeklyPlanAt !== undefined) update.lastWeeklyPlanAt = data.lastWeeklyPlanAt ? new Date(data.lastWeeklyPlanAt) : null;

  const prefs = await prisma.ceoPreferences.update({
    where: { professionalId: user.id },
    data: update,
  });
  return NextResponse.json({ prefs });
}
