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

async function extendSubscriptionByDays(patientId: string, days: number) {
  if (days === 0) return;
  const p = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!p) return;
  // Extendemos sumando días al periodo total (en meses no es exacto, pero
  // mantenemos consistencia con cómo lo calculan otras partes de la app).
  // Como días → meses no es exacto, en realidad lo que ajustamos es
  // `subscriptionStartDate` retrasándolo (lo que efectivamente alarga el final).
  if (p.subscriptionStartDate) {
    const newStart = new Date(p.subscriptionStartDate.getTime() - days * 24 * 60 * 60 * 1000);
    // Truco contra-intuitivo: para extender el final manteniendo periodMonths,
    // adelantamos la fecha de inicio (días negativos)? No. Mejor lo hacemos al revés.
    // Lo correcto es atrasar la fecha de fin. Pero como en la BD guardamos
    // periodMonths sin fecha de fin explícita, la solución limpia es atrasar el
    // inicio efectivo. Lo dejamos al revés: extendemos sumando días al startDate,
    // de modo que el final también se desplace.
    void newStart;
    await prisma.patient.update({
      where: { id: patientId },
      data: {
        subscriptionStartDate: new Date(p.subscriptionStartDate.getTime() + days * 24 * 60 * 60 * 1000),
      },
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

  // Validar paciente y que no sea rolling
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

  // Validar que no hay otra pausa activa o programada
  const existing = await prisma.programPause.findFirst({
    where: {
      patientId,
      status: { in: ["scheduled", "active"] },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Ya hay una pausa programada o activa. Cancélala o ajústala primero." },
      { status: 409 }
    );
  }

  // Determinar estado inicial (si empieza hoy o antes, ya está activa)
  const today = todayMidnight();
  const status = start <= today ? "active" : "scheduled";

  // Crear la pausa
  const pause = await prisma.programPause.create({
    data: {
      patientId,
      startDate: start,
      endDate: end,
      reason: reason?.trim() || null,
      status,
      createdById: user.id,
    },
  });

  // Si la pausa ya está activa, aplicamos la extensión inmediatamente
  if (status === "active") {
    const days = daysBetween(start, end);
    await extendSubscriptionByDays(patientId, days);
    await prisma.programPause.update({
      where: { id: pause.id },
      data: { daysExtended: days },
    });
  }

  return NextResponse.json({ ok: true, pauseId: pause.id });
}

// PATCH: editar / cancelar / finalizar antes -----------------------------------
// Acciones:
//   - action: "update" (cambia fechas, solo si scheduled)
//   - action: "cancel" (cancela, revierte extensión si ya aplicada)
//   - action: "end-now" (termina antes la pausa activa)

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
    const start = startDate ? new Date(startDate) : pause.startDate;
    const end = endDate ? new Date(endDate) : pause.endDate;
    if (end <= start) {
      return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });
    }
    await prisma.programPause.update({
      where: { id: pauseId },
      data: {
        startDate: start,
        endDate: end,
        reason: reason !== undefined ? reason?.trim() || null : pause.reason,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel") {
    if (pause.status === "ended" || pause.status === "cancelled") {
      return NextResponse.json({ error: "Esta pausa ya está cerrada" }, { status: 400 });
    }
    // Si ya estaba activa, revertir la extensión
    if (pause.status === "active" && pause.daysExtended > 0) {
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
    // Días reales en pausa = desde startDate hasta hoy
    const realDays = Math.max(1, daysBetween(pause.startDate, today));
    const diff = pause.daysExtended - realDays;
    // Si habíamos extendido más días de los vividos, restamos el exceso
    if (diff > 0) {
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
