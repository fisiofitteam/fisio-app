import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Crear una sesión suelta (no atada a un programa de la biblioteca)
// Internamente crea un Program isStandalone + Assignment + Session
export async function POST(req: NextRequest) {
  const { patientId, scheduledDate, title, tasksSnapshot } = await req.json();

  const date = new Date(scheduledDate);
  const dow = date.getDay() === 0 ? 7 : date.getDay();

  const program = await prisma.program.create({
    data: {
      name: title || `Sesión suelta ${date.toLocaleDateString("es-ES")}`,
      bodyZone: "otros",
      type: "Suelta",
      level: 1,
      weeksCount: 1,
      isStandalone: true,
    },
  });

  const week = await prisma.programWeek.create({
    data: { programId: program.id, weekNumber: 1 },
  });
  // Crear los 7 días vacíos
  for (let d = 1; d <= 7; d++) {
    await prisma.programDay.create({ data: { weekId: week.id, dayOfWeek: d } });
  }

  // El startDate del assignment debe ser el lunes de la semana de la sesión
  const startDate = new Date(date);
  const daysToMonday = dow === 1 ? 0 : -(dow - 1);
  startDate.setDate(startDate.getDate() + daysToMonday);
  startDate.setHours(0, 0, 0, 0);

  const assignment = await prisma.programAssignment.create({
    data: {
      patientId,
      programId: program.id,
      startDate,
      weeksCount: 1,
      isActive: true,
    },
  });

  const session = await prisma.programSession.create({
    data: {
      assignmentId: assignment.id,
      scheduledDate: date,
      weekNumber: 1,
      dayOfWeek: dow,
      tasksSnapshot: JSON.stringify(tasksSnapshot ?? []),
    },
  });

  return NextResponse.json(session);
}

// Editar una sesión: cambiar fecha (drag&drop) o snapshot (editar contenido)
// Solo afecta a la sesión, nunca al programa base
export async function PATCH(req: NextRequest) {
  const { id, scheduledDate, tasksSnapshot } = await req.json();

  const data: any = {};
  if (scheduledDate !== undefined) {
    const date = new Date(scheduledDate);
    const dow = date.getDay() === 0 ? 7 : date.getDay();
    data.scheduledDate = date;
    data.dayOfWeek = dow;
  }
  if (tasksSnapshot !== undefined) {
    data.tasksSnapshot = JSON.stringify(tasksSnapshot);
  }

  const session = await prisma.programSession.update({
    where: { id },
    data,
  });

  return NextResponse.json(session);
}

// Eliminar sesión (con limpieza si era una sesión suelta)
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const session = await prisma.programSession.findUnique({
    where: { id },
    include: { assignment: { include: { program: true, sessions: true } } },
  });
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

  const wasStandalone = session.assignment.program.isStandalone;
  const wasOnlySession = session.assignment.sessions.length === 1;

  await prisma.programSession.delete({ where: { id } });

  // Si era una sesión suelta y única, limpiar también el program/assignment
  if (wasStandalone && wasOnlySession) {
    await prisma.programAssignment.delete({ where: { id: session.assignmentId } });
    await prisma.program.delete({ where: { id: session.assignment.programId } });
  }

  return NextResponse.json({ ok: true });
}
