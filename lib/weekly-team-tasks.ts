// Helpers compartidos para el sistema de tareas semanales del equipo.
import { prisma } from "@/lib/prisma";
import { weekStartDate } from "@/lib/program-pauses";

export const DAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

export type WeeklyTaskItem = {
  id: string;
  title: string;
  dayOfWeek: number;          // 1..5
  order: number;
  completed: boolean;          // si este profesional la marcó esta semana
};

export type WeeklyBoard = {
  weekStartIso: string;       // lunes 00:00 UTC
  days: Array<{
    dayOfWeek: number;
    label: string;
    tasks: WeeklyTaskItem[];
    pendingCount: number;
    totalCount: number;
  }>;
};

/**
 * Construye el board semanal para un profesional concreto. Lee las tareas
 * activas con `targetRole === role` y mezcla con las completaciones de la
 * semana de ese profesional.
 */
export async function buildWeeklyBoardForProfessional(
  professionalId: string,
  role: string,
): Promise<WeeklyBoard> {
  const monday = weekStartDate(new Date());

  const [tasks, completions] = await Promise.all([
    prisma.weeklyTeamTask.findMany({
      where: { targetRole: role, active: true },
      orderBy: [{ dayOfWeek: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.weeklyTeamTaskCompletion.findMany({
      where: { professionalId, weekStartDate: monday },
      select: { taskId: true },
    }),
  ]);

  const doneSet = new Set(completions.map((c) => c.taskId));

  const days: WeeklyBoard["days"] = [];
  for (let dow = 1; dow <= 5; dow++) {
    const tasksOfDay = tasks
      .filter((t) => t.dayOfWeek === dow)
      .map<WeeklyTaskItem>((t) => ({
        id: t.id,
        title: t.title,
        dayOfWeek: t.dayOfWeek,
        order: t.order,
        completed: doneSet.has(t.id),
      }));
    const totalCount = tasksOfDay.length;
    const pendingCount = tasksOfDay.filter((t) => !t.completed).length;
    days.push({
      dayOfWeek: dow,
      label: DAY_NAMES[dow],
      tasks: tasksOfDay,
      pendingCount,
      totalCount,
    });
  }

  return { weekStartIso: monday.toISOString(), days };
}
