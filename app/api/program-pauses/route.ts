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
 * Normaliza una fecha a UTC midnight del día calendario en Europe/Madrid.
 * El fisio elige la pausa por día calendario (no hora), así el shift debe
 * comparar con las sesiones a resolución diaria.
 *
 * Sin esto, `new Date("2026-08-01")` de un input date llega como UTC 00:00,
 * pero si el server local no es UTC el `>= fromDate` puede saltarse la
 * sesión programada a las 00:00 UTC del propio día (que en Madrid ya es +2h).
 */
function startOfDayMadridUtc(d: Date): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value) - 1;
  const day = Number(parts.find((p) => p.type === "day")!.value);
  return new Date(Date.UTC(y, m, day));
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
  // Comparamos contra el inicio del día calendario Madrid — así una sesión
  // programada el mismo día que arranca la pausa entra en el shift (antes
  // podía quedarse fuera por TZ si la hora quedaba justo antes de fromDate).
  const from = startOfDayMadridUtc(fromDate);
  const sessions = await prisma.programSession.findMany({
    where: {
      assignment: { patientId, isActive: true },
      scheduledDate: { gte: from },
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

  // Fechas de pausa se guardan como UTC midnight del día calendario Madrid
  // para que shift y comparaciones sean estables sin depender de la TZ del
  // server ni de la hora a la que se envió el POST.
  const start = startOfDayMadridUtc(new Date(startDate));
  const end = startOfDayMadridUtc(new Date(endDate));
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
    const newStart = startDate ? startOfDayMadridUtc(new Date(startDate)) : pause.startDate;
    const newEnd = endDate ? startOfDayMadridUtc(new Date(endDate)) : pause.endDate;
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

// DELETE ?pauseId=xxx — eliminar completamente una pausa creada por error
// -----------------------------------------------------------------------
// A diferencia del PATCH action="cancel" (que solo funcionaba con pausas
// no terminadas y las dejaba en BD con status="cancelled"), este DELETE:
//   - Funciona con pausas en cualquier estado (scheduled, active, ended
//     e incluso cancelled).
//   - Revierte el shift de sesiones y la extensión de suscripción si la
//     pausa había llegado a aplicarlos (status active o ended).
//   - Borra el registro de la BD.
//
// Uso típico: el fisio creó una pausa con fechas incorrectas o para el
// paciente equivocado y quiere que desaparezca sin dejar rastro.
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pauseId = req.nextUrl.searchParams.get("pauseId");
  if (!pauseId) return NextResponse.json({ error: "pauseId requerido" }, { status: 400 });

  const pause = await prisma.programPause.findUnique({ where: { id: pauseId } });
  if (!pause) return NextResponse.json({ error: "Pausa no encontrada" }, { status: 404 });

  // Si la pausa YA aplicó efectos (status active / ended), los revertimos
  // antes de borrar. Las scheduled tienen daysExtended pero también se
  // aplicaron al crearse (POST llama a extendSubscriptionByDays y
  // shiftFutureSessions inmediatamente) — así que la regla es simple:
  // si daysExtended > 0 Y status != "cancelled", hay que revertir.
  if (pause.status !== "cancelled" && pause.daysExtended > 0) {
    await shiftFutureSessions(pause.patientId, pause.startDate, -pause.daysExtended);
    await extendSubscriptionByDays(pause.patientId, -pause.daysExtended);
  }

  await prisma.programPause.delete({ where: { id: pauseId } });
  return NextResponse.json({ ok: true });
}
