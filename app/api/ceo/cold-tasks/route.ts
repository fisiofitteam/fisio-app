/**
 * Tareas "frías" del CEO: pendientes (no completadas) que llevan más de
 * `cooldownDays` (configurable en CeoPreferences) sin tocarse.
 *
 * GET /api/ceo/cold-tasks → { tasks: [...], cooldownDays }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canUseCeoPersonal } from "@/lib/ceo-personal";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const prefs = await prisma.ceoPreferences.upsert({
    where: { professionalId: user.id },
    create: { professionalId: user.id },
    update: {},
  });
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - prefs.cooldownDays);

  const tasks = await prisma.ceoTask.findMany({
    where: {
      professionalId: user.id,
      completedAt: null,
      lastTouchedAt: { lt: threshold },
    },
    orderBy: { lastTouchedAt: "asc" },
    take: 50,
    include: { tags: { include: { tag: true } } },
  });

  return NextResponse.json({ tasks, cooldownDays: prefs.cooldownDays });
}
