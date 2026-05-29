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
  const plan: Plan[] = [];
  // Para detectar colisiones tras el shift (otra week del mismo program que ya esté
  // en la fecha destino), construimos un índice.
  const existingByKey = new Set(
    weeks.map((w) => `${w.programId}__${w.weekStartDate.toISOString()}`),
  );

  for (const w of weeks) {
    const current = w.weekStartDate;
    // Sumar 7 días en UTC y normalizar a midnight UTC del día calendario destino.
    const shifted = new Date(current);
    shifted.setUTCDate(shifted.getUTCDate() + 7);
    const targetUtc = new Date(
      Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
    );
    const targetKey = `${w.programId}__${targetUtc.toISOString()}`;
    const conflict = existingByKey.has(targetKey) && targetKey !== `${w.programId}__${current.toISOString()}`;
    plan.push({
      id: w.id,
      programId: w.programId,
      from: current.toISOString(),
      to: targetUtc.toISOString(),
      conflict,
    });
  }

  if (dryRun) {
    return NextResponse.json({ dryRun: true, count: plan.length, plan });
  }

  // Aplicar. Saltamos los conflictivos (raro: dos semanas del mismo programa
  // que tras el shift caen en la misma fecha).
  let updated = 0;
  for (const p of plan) {
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
