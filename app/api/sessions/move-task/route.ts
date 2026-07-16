/**
 * Mueve UNA sola tarea de una sesión origen a otro día, creando una
 * ProgramSession standalone nueva en la fecha destino con solo esa tarea.
 *
 * Cubre el caso "el día tiene dos tareas y solo quiero mover una de ellas".
 * La sesión origen se queda con el resto de tareas (o se elimina si la
 * tarea movida era la única — comportamiento defensivo aunque el cliente
 * solo debería llamar aquí cuando hay >1 task).
 *
 * POST body: { sessionId, taskId, targetDate: "YYYY-MM-DDTHH:mm:ss" }
 *   → devuelve { sourceSessionId, newSessionId?, sourceDeleted }
 *
 * Nota: crea el mismo árbol Program → Week → Days → Assignment → Session
 * que /api/sessions POST usa para sesiones sueltas — así el nuevo item
 * aparece igual en el calendario y admite edición/borrado normal.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId, taskId, targetDate } = await req.json().catch(() => ({}));
  if (!sessionId || !taskId || !targetDate) {
    return NextResponse.json({ error: "sessionId, taskId y targetDate requeridos" }, { status: 400 });
  }

  const source = await prisma.programSession.findUnique({
    where: { id: sessionId },
    include: { assignment: { select: { patientId: true } } },
  });
  if (!source) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });

  let tasks: any[] = [];
  try { tasks = JSON.parse(source.tasksSnapshot); } catch { return NextResponse.json({ error: "snapshot inválido" }, { status: 500 }); }
  const idx = tasks.findIndex((t) => String(t?.id) === String(taskId));
  if (idx < 0) return NextResponse.json({ error: "Tarea no encontrada en la sesión" }, { status: 404 });

  const [movedRaw] = tasks.splice(idx, 1);
  const patientId = source.assignment.patientId;
  const newDate = new Date(targetDate);
  const dow = newDate.getDay() === 0 ? 7 : newDate.getDay();

  // Regeneramos el id de la tarea para evitar cualquier colisión futura
  // si el snapshot original se duplica en otra operación.
  const movedTask = {
    ...movedRaw,
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };

  const result = await prisma.$transaction(async (tx) => {
    // 1. Crear árbol standalone Program → Week → 7 Days → Assignment
    //    para la sesión nueva. Reproducimos el patrón de /api/sessions POST.
    const program = await tx.program.create({
      data: {
        name: `Sesión ${newDate.toLocaleDateString("es-ES")}`,
        bodyZone: "otros",
        type: "Suelta",
        level: 1,
        weeksCount: 1,
        isStandalone: true,
      },
    });
    const week = await tx.programWeek.create({
      data: { programId: program.id, weekNumber: 1 },
    });
    for (let d = 1; d <= 7; d++) {
      await tx.programDay.create({ data: { weekId: week.id, dayOfWeek: d } });
    }
    const startDate = new Date(newDate);
    startDate.setDate(startDate.getDate() - (dow - 1));
    startDate.setHours(0, 0, 0, 0);
    const assignment = await tx.programAssignment.create({
      data: {
        patientId,
        programId: program.id,
        startDate,
        weeksCount: 1,
        isActive: true,
      },
    });
    const created = await tx.programSession.create({
      data: {
        assignmentId: assignment.id,
        scheduledDate: newDate,
        weekNumber: 1,
        dayOfWeek: dow,
        tasksSnapshot: JSON.stringify([movedTask]),
      },
    });

    // 2. Actualizar la sesión origen: si se quedó sin tareas la borramos,
    //    si no, guardamos el snapshot recortado.
    if (tasks.length === 0) {
      await tx.programSession.delete({ where: { id: sessionId } });
    } else {
      await tx.programSession.update({
        where: { id: sessionId },
        data: { tasksSnapshot: JSON.stringify(tasks) },
      });
    }

    return {
      ok: true,
      sourceSessionId: sessionId,
      newSessionId: created.id,
      sourceDeleted: tasks.length === 0,
    };
  });

  return NextResponse.json(result);
}
