import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { weekStartDate } from "@/lib/program-pauses";

// POST /api/team-tasks/complete → marca una tarea como completada esta semana
// por el profesional logueado.
// body: { taskId }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const taskId = typeof b?.taskId === "string" ? b.taskId : "";
  if (!taskId) return NextResponse.json({ error: "taskId obligatorio" }, { status: 400 });

  // Validar que la tarea está dirigida al rol del usuario (excepto CEO, que
  // puede simular marcado para pruebas).
  const task = await prisma.weeklyTeamTask.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  // head_success también puede marcar tareas de fisio (ejerce las dos cosas).
  const allowedRoles = user.role === "head_success" ? ["fisio", "head_success"] : [user.role];
  if (user.role !== "ceo" && !allowedRoles.includes(task.targetRole)) {
    return NextResponse.json({ error: "Esta tarea no es para tu rol" }, { status: 403 });
  }

  const monday = weekStartDate(new Date());

  const completion = await prisma.weeklyTeamTaskCompletion.upsert({
    where: {
      taskId_professionalId_weekStartDate: {
        taskId,
        professionalId: user.id,
        weekStartDate: monday,
      },
    },
    create: { taskId, professionalId: user.id, weekStartDate: monday },
    update: {},
  });
  return NextResponse.json({ ok: true, completedAt: completion.completedAt });
}

// DELETE /api/team-tasks/complete?taskId=X → des-marca esta semana.
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ error: "taskId obligatorio" }, { status: 400 });

  const monday = weekStartDate(new Date());
  await prisma.weeklyTeamTaskCompletion.deleteMany({
    where: { taskId, professionalId: user.id, weekStartDate: monday },
  });
  return NextResponse.json({ ok: true });
}
