/**
 * Mueve UNA sola tarea de una sesión origen a otro día, creando una
 * ProgramSession nueva en la fecha destino con solo esa tarea. Los tests de
 * la batería de hombro conservan su asignación y semana originales.
 *
 * Cubre el caso "el día tiene dos tareas y solo quiero mover una de ellas".
 * La sesión origen se queda con el resto de tareas (o se elimina si la
 * tarea movida era la única — comportamiento defensivo aunque el cliente
 * solo debería llamar aquí cuando hay >1 task).
 *
 * POST body: { sessionId, taskId, targetDate: "YYYY-MM-DDTHH:mm:ss" }
 *   → devuelve { sourceSessionId, newSessionId?, sourceDeleted }
 *
 * Las demás actividades mantienen el árbol standalone del flujo histórico.
 */
import { NextRequest, NextResponse } from "next/server";
import { groupedBatteryHasReview } from "@/lib/shoulder-battery-server";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { shoulderBatteryKey } from "@/lib/shoulder-battery";
import { isShoulderPilotTask } from "@/lib/patient-shoulder-session";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId, taskId, targetDate } = await req.json().catch(() => ({}));
  if (!sessionId || !taskId || !targetDate) {
    return NextResponse.json({ error: "sessionId, taskId y targetDate requeridos" }, { status: 400 });
  }

  const source = await prisma.programSession.findUnique({
    where: { id: sessionId },
    include: { assignment: { select: { patientId: true, programId: true } }, shoulderPilotReview:{select:{sessionId:true}} },
  });
  if (!source) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });

  if (!await canAccessEvidencePatient(source.assignment.patientId, user)) return NextResponse.json({error:"No autorizado"},{status:403});
  if (source.shoulderPilotReview || await groupedBatteryHasReview(sessionId)) return NextResponse.json({error:"La valoración ya tiene datos. Conserva sus pruebas juntas para mantener el informe."},{status:409});

  let tasks: any[] = [];
  try { tasks = JSON.parse(source.tasksSnapshot); } catch { return NextResponse.json({ error: "snapshot inválido" }, { status: 500 }); }
  const idx = tasks.findIndex((t) => String(t?.id) === String(taskId));
  if (idx < 0) return NextResponse.json({ error: "Tarea no encontrada en la sesión" }, { status: 404 });

  const [movedRaw] = tasks.splice(idx, 1);
  const patientId = source.assignment.patientId;
  const newDate = new Date(targetDate);
  if (Number.isNaN(newDate.getTime())) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  const dow = newDate.getDay() === 0 ? 7 : newDate.getDay();
  const keepAssignment = !!shoulderBatteryKey(source) && isShoulderPilotTask(movedRaw);

  // Regeneramos el id de la tarea para evitar cualquier colisión futura
  // si el snapshot original se duplica en otra operación.
  const movedTask = {
    ...movedRaw,
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };

  const result = await prisma.$transaction(async (tx) => {
    let targetAssignmentId = source.assignmentId;
    if (!keepAssignment) {
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
      targetAssignmentId = assignment.id;
    }
    const created = await tx.programSession.create({
      data: {
        assignmentId: targetAssignmentId,
        scheduledDate: newDate,
        weekNumber: keepAssignment ? source.weekNumber : 1,
        dayOfWeek: dow,
        tasksSnapshot: JSON.stringify([movedTask]),
      },
    });

    await tx.assessmentVideo.updateMany({ where: { sessionId, taskId }, data: { sessionId: created.id, taskId: movedTask.id } });
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
