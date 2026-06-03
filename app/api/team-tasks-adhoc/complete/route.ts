import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { monthStartMadridUtc } from "@/lib/team-tasks-adhoc";

// POST /api/team-tasks-adhoc/complete
// body: { taskId } → marca como completada por el usuario actual para la
// instancia vigente. Monthly: occurrenceDate = primer día del mes Madrid.
// Range: occurrenceDate = startDate de la tarea.
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const taskId = typeof b?.taskId === "string" ? b.taskId : "";
  if (!taskId) return NextResponse.json({ error: "taskId obligatorio" }, { status: 400 });

  const task = await prisma.teamTaskAdHoc.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

  // Solo el profesional del rol destinatario puede marcar (CEO también para
  // pruebas). head_success también puede marcar tareas de fisio porque
  // ejerce las dos cosas.
  const allowedRoles = user.role === "head_success" ? ["fisio", "head_success"] : [user.role];
  if (user.role !== "ceo" && !allowedRoles.includes(task.targetRole)) {
    return NextResponse.json({ error: "Esta tarea no es para tu rol" }, { status: 403 });
  }

  const occurrenceDate = task.kind === "monthly" ? monthStartMadridUtc() : task.startDate!;

  const completion = await prisma.teamTaskAdHocCompletion.upsert({
    where: {
      taskId_professionalId_occurrenceDate: {
        taskId,
        professionalId: user.id,
        occurrenceDate,
      },
    },
    create: { taskId, professionalId: user.id, occurrenceDate },
    update: {},
  });
  return NextResponse.json({ ok: true, completedAt: completion.completedAt });
}
