/**
 * Backfill: pacientes creados por alta manual (`/api/leads/convert`) antes de
 * que la ruta guardara `onboardingTasks`. Sin ese JSON, la vista de pacientes
 * los trata como legacy y saltan la sección "🚀 Onboarding · Semana 0".
 *
 * POST /api/admin/backfill-onboarding-tasks
 *
 * Solo CEO. Idempotente. Filtro conservador:
 *   - onboardingTasks IS NULL
 *   - giftsAlreadySent = false  (protege legacies migrados)
 *   - week0CompletedAt IS NULL
 *   - subscriptionStartDate en los últimos 14 días (ventana de onboarding)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);

  // Cargamos candidatos recientes; el filtro por onboardingTasks == null lo
  // hacemos en memoria (Prisma exige sintaxis especial para JSON null y el
  // volumen es pequeño — <20 pacientes por ventana de 14 días).
  const recent = await prisma.patient.findMany({
    where: {
      giftsAlreadySent: false,
      week0CompletedAt: null,
      subscriptionStartDate: { gte: fourteenDaysAgo },
    },
    select: {
      id: true,
      fullName: true,
      onboardingTasks: true,
      subscriptionStartDate: true,
    },
  });

  const updated: { id: string; fullName: string }[] = [];
  for (const p of recent) {
    if (p.onboardingTasks != null) continue;
    await prisma.patient.update({
      where: { id: p.id },
      data: {
        onboardingTasks: { anamnesis: false, contract: false, firstSession: false },
      },
    });
    updated.push({ id: p.id, fullName: p.fullName });
  }

  return NextResponse.json({ ok: true, updatedCount: updated.length, updated });
}
