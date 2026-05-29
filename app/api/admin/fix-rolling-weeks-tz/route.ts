import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

// POST /api/admin/fix-rolling-weeks-tz?dryRun=1
//
// Migración one-shot. Antes había un bug de TZ en weekStartDate (lib/program-pauses):
// el cliente enviaba el lunes en hora de Madrid (p.ej. 2026-05-25 00:00 Madrid =
// 2026-05-24 22:00 UTC) y el server hacía setHours/setDate en UTC, retrocediendo
// 6 días desde domingo → guardaba el lunes de la semana anterior. TODAS las
// RollingWeek tienen su `weekStartDate` desplazado -7 días.
//
// Esta migración suma +7 días a weekStartDate de cada RollingWeek y lo normaliza
// a UTC midnight (Date.UTC del calendario derivado).
//
// dryRun=1 → solo devuelve qué se cambiaría, no escribe.
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const weeks = await prisma.rollingWeek.findMany({
    select: { id: true, programId: true, weekStartDate: true },
    orderBy: { weekStartDate: "asc" },
  });

  type Plan = { id: string; programId: string; from: string; to: string; conflict: boolean };
  const plan: Plan[] = weeks.map((w) => {
    const current = w.weekStartDate;
    const shifted = new Date(current);
    shifted.setUTCDate(shifted.getUTCDate() + 7);
    const targetUtc = new Date(
      Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
    );
    return {
      id: w.id,
      programId: w.programId,
      from: current.toISOString(),
      to: targetUtc.toISOString(),
      conflict: false, // se calcula abajo sobre el estado FINAL
    };
  });

  // Conflicto real = dos planes acaban en la misma (programId, to). Como todas
  // las semanas se desplazan +7, normalmente no hay colisión (el destino estaba
  // libre porque la otra semana también se mueve). Solo se daría conflicto si
  // hubiese duplicados en origen, lo que el unique constraint ya impide.
  const finalCounts = new Map<string, number>();
  for (const p of plan) {
    const k = `${p.programId}__${p.to}`;
    finalCounts.set(k, (finalCounts.get(k) || 0) + 1);
  }
  for (const p of plan) {
    const k = `${p.programId}__${p.to}`;
    if ((finalCounts.get(k) || 0) > 1) p.conflict = true;
  }

  if (dryRun) {
    return NextResponse.json({ dryRun: true, count: plan.length, plan });
  }

  // Aplicar en orden descendente por `from`. Así, al mover una semana, su
  // destino ya está libre porque la semana que estaba allí se movió antes.
  // Esto evita violar @@unique([programId, weekStartDate]) durante el proceso.
  const sortedPlan = [...plan].sort((a, b) => (a.from < b.from ? 1 : -1));
  let updated = 0;
  for (const p of sortedPlan) {
    if (p.conflict) continue;
    await prisma.rollingWeek.update({
      where: { id: p.id },
      data: { weekStartDate: new Date(p.to) },
    });
    updated++;
  }

  return NextResponse.json({
    dryRun: false,
    total: plan.length,
    updated,
    skippedConflicts: plan.filter((p) => p.conflict),
  });
}
