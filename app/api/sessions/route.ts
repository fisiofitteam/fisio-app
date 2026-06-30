import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Crea una o varias sesiones sueltas (no atadas a un programa de la
// biblioteca). Internamente cada sesión vive en su propio Program
// isStandalone + Assignment + Session (igual que el flujo histórico).
//
// Body:
//   { patientId, scheduledDate, title?, tasksSnapshot? }
//     → crea 1 sesión en scheduledDate.
//   { patientId, scheduledDate, title?, tasksSnapshot?, recurrence }
//     → crea N sesiones aplicando la recurrencia.
//
// recurrence = {
//   daysOfWeek: number[]   // 1..7 (1=Lun, 7=Dom) — qué días repetir
//   weeks: number          // cuántas semanas durar (la primera incluida)
// }
//
// Respuesta:
//   - Sin recurrence: devuelve la sesión creada (compat con el front actual).
//   - Con recurrence: devuelve { sessions: Session[], count: number }.
export async function POST(req: NextRequest) {
  const { patientId, scheduledDate, title, tasksSnapshot, recurrence } = await req.json();

  const baseDate = new Date(scheduledDate);
  if (Number.isNaN(baseDate.getTime())) {
    return NextResponse.json({ error: "scheduledDate inválida" }, { status: 400 });
  }

  // Validamos recurrencia si llega.
  const isRecurring = recurrence && typeof recurrence === "object";
  let daysOfWeek: number[] = [];
  let weeks = 1;
  if (isRecurring) {
    const days = Array.isArray(recurrence.daysOfWeek)
      ? recurrence.daysOfWeek
          .map((x: unknown) => Number(x))
          .filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 7)
      : [];
    daysOfWeek = Array.from(new Set<number>(days)).sort((a, b) => a - b);
    weeks = Math.max(1, Math.min(52, Number(recurrence.weeks) || 1));
    if (daysOfWeek.length === 0) {
      return NextResponse.json(
        { error: "Selecciona al menos un día de la semana para la recurrencia" },
        { status: 400 }
      );
    }
  }

  // Calculamos las fechas a crear.
  // - Sin recurrencia: [baseDate].
  // - Con recurrencia: lunes de la semana base + (semana * 7) + (día - 1).
  //   La primera ocurrencia respeta scheduledDate aunque su dow no esté en
  //   daysOfWeek — añadirla siempre evita que el fisio se confunda si el
  //   día clickado no está en la selección.
  const dates: Date[] = [];
  if (!isRecurring) {
    dates.push(baseDate);
  } else {
    const baseDow = baseDate.getDay() === 0 ? 7 : baseDate.getDay();
    const monday = new Date(baseDate);
    monday.setDate(monday.getDate() - (baseDow - 1));
    monday.setHours(0, 0, 0, 0);

    for (let w = 0; w < weeks; w++) {
      for (const d of daysOfWeek) {
        const occ = new Date(monday);
        occ.setDate(monday.getDate() + w * 7 + (d - 1));
        // No creamos sesiones en el pasado respecto al clic original:
        // si la primera semana tiene días anteriores a baseDate, los saltamos.
        if (w === 0 && occ < baseDate) {
          // excepción: si occ == baseDate (mismo día) sí lo creamos.
          if (occ.toDateString() !== baseDate.toDateString()) continue;
        }
        dates.push(occ);
      }
    }
    // Si la fecha clickada no estaba en la selección de días pero el usuario
    // quería que la primera sesión fuera ese día concreto, no la añadimos
    // por defecto. Si tras filtrar quedó vacío, error.
    if (dates.length === 0) {
      return NextResponse.json(
        { error: "La recurrencia no genera ninguna sesión válida" },
        { status: 400 }
      );
    }
  }

  // Creamos N Program/Assignment/Session (uno por sesión) — mismo patrón
  // que el flujo histórico. Cada sesión es independiente: borrar una no
  // afecta a las demás.
  const created: any[] = [];
  for (const date of dates) {
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
    for (let d = 1; d <= 7; d++) {
      await prisma.programDay.create({ data: { weekId: week.id, dayOfWeek: d } });
    }

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

    created.push(session);
  }

  // Compat con el front antiguo: si era 1 sola sesión sin recurrencia,
  // devolvemos el objeto Session pelado. Si era recurrencia, lista.
  if (!isRecurring) return NextResponse.json(created[0]);
  return NextResponse.json({ sessions: created, count: created.length });
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
