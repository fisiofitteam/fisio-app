import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

// Helpers ---------------------------------------------------------------------

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

/**
 * Alarga el periodo de suscripción del paciente en función de los días de pausa.
 *
 * Convertimos días → meses (1 mes = 30 días, truncando hacia abajo):
 *   - 14 días → 0 meses (la suscripción no cambia, se "pierden" esos días)
 *   - 30 días → 1 mes
 *   - 60 días → 2 meses
 *
 * IMPORTANTE: NO tocamos `subscriptionStartDate` para preservar el dato real
 * (alta del paciente). Las métricas tipo LTV/cohorts/antigüedad seguirán siendo
 * correctas. La pequeña pérdida de precisión (hasta 29 días) es aceptable según
 * decisión de producto.
 */
async function extendSubscriptionByDays(patientId: string, days: number) {
  if (days === 0) return;
  const p = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!p) return;
  // truncamiento (siempre redondea hacia 0): 14 → 0, -14 → 0
  const monthsDelta = Math.trunc(days / 30);
  if (monthsDelta === 0) return;
  const newPeriod = Math.max(1, p.subscriptionPeriodMonths + monthsDelta);
  await prisma.patient.update({
    where: { id: patientId },
    data: { subscriptionPeriodMonths: newPeriod },
  });
}

/**
 * Desplaza N días las sesiones del programa del paciente que caen ON OR AFTER `fromDate`.
 * - days > 0: empuja hacia el futuro (al crear pausa)
 * - days < 0: tira hacia el pasado (al cancelar pausa)
 *
 * Solo toca sesiones de assignments ACTIVOS y no completadas.
 */
async function shiftFutureSessions(patientId: string, fromDate: Date, days: number) {
  if (days === 0) return;
  const sessions = await prisma.programSession.findMany({
    where: {
      assignment: { patientId, isActive: true },
      scheduledDate: { gte: fromDate },
      completedAt: null,
    },
  });
  for (const s of sessions) {
    await prisma.programSession.update({
      where: { id: s.id },
      data: { scheduledDate: addDays(s.scheduledDate, days) },
    });
  }
}

// GET: lista pausas del paciente ----------------------------------------------

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patientId = req.nextUrl.searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 });

  const pauses = await prisma.programPause.findMany({
    where: { patientId },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(pauses);
}

// POST: crear pausa ------------------------------------------------------------

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { patientId, startDate, endDate, reason } = await req.json();

  if (!patientId || !startDate || !endDate) {
    return NextResponse.json({ error: "Faltan datos obligatorios" }, { status: 400 });
  }

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  if (patient.programMode === "rolling") {
    return NextResponse.json(
      { error: "Los programas ADVANCE rolling no admiten pausas" },
      { status: 400 }
    );
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end <= start) {
    return NextResponse.json(
      { error: "La fecha de fin debe ser posterior a la de inicio" },
      { status: 400 }
    );
  }

  // Una sola pausa scheduled/active por paciente
  const existing = await prisma.programPause.findFirst({
    where: { patientId, status: { in: ["scheduled", "active"] } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Ya hay una pausa programada o activa. Cancélala o ajústala primero." },
      { status: 409 }
    );
  }

  const today = todayMidnight();
  const status = start <= today ? "active" : "scheduled";
  const days = daysBetween(start, end);

  // Crear la pausa (siempre con daysExtended ya rellenado: aplicamos extensión y shift al crearla)
  const pause = await prisma.programPause.create({
    data: {
      patientId,
      startDate: start,
      endDate: end,
      reason: reason?.trim() || null,
      status,
      daysExtended: days,
      createdById: user.id,
    },
  });

  // Aplicar extensión y desplazamiento de sesiones futuras (desde startDate)
  await extendSubscriptionByDays(patientId, days);
  await shiftFutureSessions(patientId, start, days);

  return NextResponse.json({ ok: true, pauseId: pause.id });
}

// PATCH: editar / cancelar / finalizar antes -----------------------------------

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { pauseId, action, startDate, endDate, reason } = await req.json();
  if (!pauseId || !action) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  const pause = await prisma.programPause.findUnique({ where: { id: pauseId } });
  if (!pause) return NextResponse.json({ error: "Pausa no encontrada" }, { status: 404 });

  if (action === "update") {
    if (pause.status !== "scheduled") {
      return NextResponse.json(
        { error: "Solo se puede editar una pausa programada (aún no empezada)" },
        { status: 400 }
      );
    }
    const newStart = startDate ? new Date(startDate) : pause.startDate;
    const newEnd = endDate ? new Date(endDate) : pause.endDate;
    if (newEnd <= newStart) {
      return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });
    }

    // 1. Revertir el shift y la extensión anteriores
    await shiftFutureSessions(pause.patientId, pause.startDate, -pause.daysExtended);
    await extendSubscriptionByDays(pause.patientId, -pause.daysExtended);

    // 2. Aplicar la nueva
    const newDays = daysBetween(newStart, newEnd);
    await shiftFutureSessions(pause.patientId, newStart, newDays);
    await extendSubscriptionByDays(pause.patientId, newDays);

    await prisma.programPause.update({
      where: { id: pauseId },
      data: {
        startDate: newStart,
        endDate: newEnd,
        reason: reason !== undefined ? reason?.trim() || null : pause.reason,
        daysExtended: newDays,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel") {
    if (pause.status === "ended" || pause.status === "cancelled") {
      return NextResponse.json({ error: "Esta pausa ya está cerrada" }, { status: 400 });
    }
    // Revertir desplazamiento y extensión
    if (pause.daysExtended > 0) {
      await shiftFutureSessions(pause.patientId, pause.startDate, -pause.daysExtended);
      await extendSubscriptionByDays(pause.patientId, -pause.daysExtended);
    }
    await prisma.programPause.update({
      where: { id: pauseId },
      data: { status: "cancelled", daysExtended: 0 },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "end-now") {
    if (pause.status !== "active") {
      return NextResponse.json({ error: "Solo se puede finalizar antes una pausa activa" }, { status: 400 });
    }
    const today = todayMidnight();
    const realDays = Math.max(1, daysBetween(pause.startDate, today));
    const diff = pause.daysExtended - realDays;
    // Si vivió menos días de los previstos, devolvemos las sesiones desplazadas
    if (diff > 0) {
      // Reculamos solo `diff` días, manteniendo los `realDays` ya consumidos
      await shiftFutureSessions(pause.patientId, today, -diff);
      await extendSubscriptionByDays(pause.patientId, -diff);
    }
    await prisma.programPause.update({
      where: { id: pauseId },
      data: {
        status: "ended",
        actualEndDate: today,
        daysExtended: realDays,
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
}
