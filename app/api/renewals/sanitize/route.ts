/**
 * Endpoint de SANEAMIENTO de periodos de suscripción.
 *
 * Limpia datos inconsistentes para un paciente:
 *  1. Periodos con duración real < 1 día → se eliminan si están seguidos por otro periodo
 *  2. Múltiples activos → solo el más reciente queda como "active"
 *  3. Periodos activos con endDate < hoy → se cierran (status: finished)
 *  4. Recalcula subscriptionTotalMonths del paciente
 *  5. Si solo queda un periodo y arrastra historial roto, lo deja consistente
 *
 * Diseñado para invocarse:
 *  - Automáticamente al cargar la ficha del paciente (silencioso)
 *  - Manualmente desde el endpoint admin/migrate-periods (saneamiento masivo)
 *
 * Idempotente: ejecutarlo varias veces produce el mismo resultado.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export async function sanitizePatientRenewals(patientId: string) {
  const renewals = await prisma.subscriptionRenewal.findMany({
    where: { patientId },
    orderBy: { startDate: "asc" },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const actions: string[] = [];

  // 1. Eliminar periodos basura (duración < 1 día) que tengan otro periodo después
  // (típico bug v44: "renovar" cerró el actual al mismo día de su creación)
  for (let i = 0; i < renewals.length - 1; i++) {
    const r = renewals[i];
    if (!r.startDate || !r.endDate) continue;
    const dur = daysBetween(r.startDate, r.endDate);
    if (dur < 1) {
      await prisma.subscriptionRenewal.delete({ where: { id: r.id } });
      actions.push(`Eliminado periodo basura (duración ${dur}d): ${r.programType || "—"} ${r.startDate.toISOString().slice(0,10)}`);
      // Reasignar el startDate del siguiente periodo si comparte fecha basura
      const next = renewals[i + 1];
      if (next && next.startDate && r.startDate && daysBetween(r.startDate, next.startDate) <= 1) {
        // El siguiente empezaba justo después: se debería ajustar para asumir la fecha original
        // Movemos el startDate del siguiente a la del eliminado (más cierta)
        await prisma.subscriptionRenewal.update({
          where: { id: next.id },
          data: { startDate: r.startDate },
        });
        // Recalcular su endDate proporcionalmente
        const newEnd = new Date(r.startDate);
        newEnd.setMonth(newEnd.getMonth() + (next.periodMonths || 4));
        await prisma.subscriptionRenewal.update({
          where: { id: next.id },
          data: { endDate: newEnd },
        });
        actions.push(`Movido startDate del siguiente periodo a ${r.startDate.toISOString().slice(0,10)}`);
      }
    }
  }

  // 2. Releer
  const clean = await prisma.subscriptionRenewal.findMany({
    where: { patientId },
    orderBy: { startDate: "asc" },
  });

  // 3. Cerrar activos cuyo endDate ya pasó
  for (const r of clean) {
    if (r.status === "active" && r.endDate && r.endDate < today) {
      await prisma.subscriptionRenewal.update({
        where: { id: r.id },
        data: { status: "finished" },
      });
      actions.push(`Cerrado periodo vencido: ${r.programType || "—"}`);
    }
  }

  // 4. Garantizar UN solo activo (el más reciente que aún no haya vencido)
  const stillActive = await prisma.subscriptionRenewal.findMany({
    where: { patientId, status: "active" },
    orderBy: { startDate: "desc" },
  });
  if (stillActive.length > 1) {
    // Dejar solo el primero (más reciente), pasar el resto a finished
    const [keep, ...rest] = stillActive;
    for (const r of rest) {
      await prisma.subscriptionRenewal.update({
        where: { id: r.id },
        data: { status: "finished" },
      });
      actions.push(`Hay múltiples activos: pasado a finished ${r.programType || "—"}`);
    }
  }

  // 5. Si hay scheduled cuyo startDate ya llegó, activarlos (lógica del cron en demanda)
  const scheduledReady = await prisma.subscriptionRenewal.findMany({
    where: {
      patientId,
      status: "scheduled",
      startDate: { lte: today },
    },
    orderBy: { startDate: "asc" },
  });
  for (const r of scheduledReady) {
    // Cerrar otros activos
    await prisma.subscriptionRenewal.updateMany({
      where: { patientId, status: "active", id: { not: r.id } },
      data: { status: "finished" },
    });
    await prisma.subscriptionRenewal.update({
      where: { id: r.id },
      data: { status: "active" },
    });
    actions.push(`Activado periodo programado que ya empezó: ${r.programType || "—"}`);
  }

  // 6. Recalcular subscriptionTotalMonths y sincronizar paciente con su periodo activo
  const finalAll = await prisma.subscriptionRenewal.findMany({
    where: { patientId },
    orderBy: { startDate: "asc" },
  });
  const totalMonths = finalAll.reduce((sum, r) => sum + (r.periodMonths || 0), 0);
  const activeR = finalAll.find((r) => r.status === "active");
  const dataToUpdate: any = { subscriptionTotalMonths: totalMonths };
  if (activeR && activeR.programType) {
    dataToUpdate.programType = activeR.programType;
    if (activeR.startDate) dataToUpdate.subscriptionStartDate = activeR.startDate;
    dataToUpdate.subscriptionPeriodMonths = activeR.periodMonths;
  }
  await prisma.patient.update({
    where: { id: patientId },
    data: dataToUpdate,
  });

  return { ok: true, actions };
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patientId = req.nextUrl.searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 });

  const result = await sanitizePatientRenewals(patientId);
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
