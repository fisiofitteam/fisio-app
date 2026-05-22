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
 * Calcula los días a desplazar las sesiones según la duración de la pausa.
 *
 * Regla: las sesiones siempre se desplazan en MÚLTIPLOS DE 7 días,
 * para que el programa se reanude siempre en los mismos días de la semana
 * (martes/viernes siguen siendo martes/viernes después de la pausa).
 *
 * Redondeamos hacia arriba al múltiplo de 7 que cubra la duración de la pausa.
 *   - Pausa de 14 días (2 semanas exactas L-D) → 14 días de desplazamiento ✓
 *   - Pausa de 10 días (no completa)            → 14 días de desplazamiento (1 semana extra de regalo)
 *   - Pausa de 9 días                            → 14 días
 *   - Pausa de 7 días                            → 7 días
 *   - Pausa de 1 día                             → 7 días
 */
function pauseShiftDays(rawDays: number): number {
  if (rawDays <= 0) return 0;
  return Math.ceil(rawDays / 7) * 7;
}

/**
 * Alarga el periodo activo de suscripción del paciente en días exactos.
 *
 * Toca dos lugares:
 *  1. `SubscriptionRenewal.endDate` del periodo activo → suma N días.
 *     Es la fuente de verdad visible en la ficha clínica.
 *  2. `Patient.subscriptionPeriodMonths` → mantiene compat con código viejo
 *     que mira ese campo (round trip dias→meses, sin pérdida en endDate).
 *
 * NO tocamos `subscriptionStartDate` para preservar el dato real de alta.
 */
async function extendSubscriptionByDays(patientId: string, days: number) {
  if (days === 0) return;

  // 1. Periodo activo: sumar/restar días exactos al endDate
  const activePeriod = await prisma.subscriptionRenewal.findFirst({
    where: { patientId, status: "active" },
    orderBy: { startDate: "desc" },
  });
  if (activePeriod?.endDate) {
    const newEnd = new Date(activePeriod.endDate.getTime() + days * 86400000);
    await prisma.subscriptionRenewal.update({
      where: { id: activePeriod.id },
      data: { endDate: newEnd },
    });
  }

  // 2. Patient.subscriptionPeriodMonths: opcional, solo para compat con cosas
  // que lean ese campo. Convertimos días → meses (truncando) y sumamos.
  const p = await prisma.patient.findUnique({ where: { id: patientId } });
  if (p) {
    const monthsDelta = Math.trunc(days / 30);
    if (monthsDelta !== 0) {
      const newPeriod = Math.max(1, p.subscriptionPeriodMonths + monthsDelta);
      await prisma.patient.update({
        where: { id: patientId },
        data: { subscriptionPeriodMonths: newPeriod },
      });
    }
  }
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

  // Permitimos múltiples pausas por paciente, pero validamos que la nueva
  // no SOLAPE en fechas con otra existente (scheduled o active).
  // Una pausa pasada (status=ended) no bloquea nuevas pausas futuras.
  const overlapping = await prisma.programPause.findFirst({
    where: {
      patientId,
      status: { in: ["scheduled", "active"] },
      // Solapamiento clásico: A.start < B.end AND A.end > B.start
      startDate: { lt: end },
      endDate: { gt: start },
    },
  });
  if (overlapping) {
    const ovStart = overlapping.startDate.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
    const ovEnd = overlapping.endDate.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
    return NextResponse.json(
      { error: `Las fechas se solapan con otra pausa existente (${ovStart} – ${ovEnd}). Ajusta las fechas o cancela la otra primero.` },
      { status: 409 }
    );
  }

  const today = todayMidnight();
  const status = start <= today ? "active" : "scheduled";
  const rawDays = daysBetween(start, end);
  const shiftDays = pauseShiftDays(rawDays); // múltiplo de 7

  // Crear la pausa (siempre con daysExtended ya rellenado: aplicamos extensión y shift al crearla)
  const pause = await prisma.programPause.create({
    data: {
      patientId,
      startDate: start,
      endDate: end,
      reason: reason?.trim() || null,
      status,
      daysExtended: shiftDays,
      createdById: user.id,
    },
  });

  // Aplicar extensión y desplazamiento de sesiones futuras (desde startDate)
  await extendSubscriptionByDays(patientId, shiftDays);
  await shiftFutureSessions(patientId, start, shiftDays);

  return NextResponse.json({ ok: true, pauseId: pause.id, shiftDays });
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

    // 2. Aplicar la nueva (con shift redondeado a múltiplo de 7)
    const rawNewDays = daysBetween(newStart, newEnd);
    const newShiftDays = pauseShiftDays(rawNewDays);
    await shiftFutureSessions(pause.patientId, newStart, newShiftDays);
    await extendSubscriptionByDays(pause.patientId, newShiftDays);

    await prisma.programPause.update({
      where: { id: pauseId },
      data: {
        startDate: newStart,
        endDate: newEnd,
        reason: reason !== undefined ? reason?.trim() || null : pause.reason,
        daysExtended: newShiftDays,
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
    // Redondeamos las semanas vividas al múltiplo de 7 más cercano por arriba
    const realShiftDays = pauseShiftDays(realDays);
    const diff = pause.daysExtended - realShiftDays;
    // Si la extensión inicial era mayor que el ajustado real → devolver sesiones
    if (diff > 0) {
      await shiftFutureSessions(pause.patientId, today, -diff);
      await extendSubscriptionByDays(pause.patientId, -diff);
    }
    await prisma.programPause.update({
      where: { id: pauseId },
      data: {
        status: "ended",
        actualEndDate: today,
        daysExtended: realShiftDays,
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
}
