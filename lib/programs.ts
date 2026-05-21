import { prisma } from "./prisma";

export const DAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const DAY_SHORT = ["", "L", "M", "X", "J", "V", "S", "D"];

// Devuelve el lunes de la semana que contiene a `date`
export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (dow - 1));
  return d;
}

// Genera todas las sesiones de una asignación: por cada semana, por cada día, hace snapshot del JSON
export async function generateSessions(assignmentId: string) {
  const assignment = await prisma.programAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      program: {
        include: {
          weeks: {
            orderBy: { weekNumber: "asc" },
            include: {
              days: {
                orderBy: { dayOfWeek: "asc" },
                include: {
                  tasks: {
                    orderBy: { order: "asc" },
                    include: {
                      workout: { include: { exercises: { include: { exercise: true }, orderBy: { order: "asc" } } } },
                      video: true,
                      form: true,
                      evolution: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!assignment) throw new Error("Assignment not found");

  // Borrar futuras no completadas
  await prisma.programSession.deleteMany({
    where: { assignmentId, completedAt: null },
  });

  const startMonday = getMondayOfWeek(assignment.startDate);

  // Mapa semana → días
  const weekDaysMap = new Map<number, typeof assignment.program.weeks[number]["days"]>();
  for (const w of assignment.program.weeks) {
    weekDaysMap.set(w.weekNumber, w.days);
  }

  // Si el programa tiene N semanas pero asignación tiene M > N, repetimos la última
  const definedWeeks = assignment.program.weeks.map((w) => w.weekNumber);
  const lastDefined = definedWeeks.length > 0 ? Math.max(...definedWeeks) : 1;

  for (let week = 1; week <= assignment.weeksCount; week++) {
    const sourceWeekNum = week <= lastDefined ? week : lastDefined;
    const days = weekDaysMap.get(sourceWeekNum) ?? [];

    for (const day of days) {
      const tasksSnapshot = day.tasks.map((t) => {
        if (t.type === "WORKOUT" && t.workout) {
          return {
            id: t.id,
            type: "WORKOUT",
            title: t.title,
            order: t.order,
            bodyText: t.workout.bodyText,
            exercises: t.workout.exercises.map((we) => ({
              id: we.exercise.id,
              name: we.exercise.name,
              category: we.exercise.category,
              youtubeUrl: we.exercise.youtubeUrl,
              description: we.exercise.description,
            })),
          };
        }
        if (t.type === "VIDEO" && t.video) {
          return {
            id: t.id,
            type: "VIDEO",
            title: t.title,
            order: t.order,
            youtubeUrl: t.video.youtubeUrl,
            description: t.video.description,
          };
        }
        if (t.type === "FORM" && t.form) {
          return {
            id: t.id,
            type: "FORM",
            title: t.title,
            order: t.order,
            questions: JSON.parse(t.form.questions),
          };
        }
        if (t.type === "EVOLUTION" && t.evolution) {
          return {
            id: t.id,
            type: "EVOLUTION",
            title: t.title,
            order: t.order,
            instructions: t.evolution.instructions,
          };
        }
        return { id: t.id, type: t.type, title: t.title, order: t.order };
      });

      const sessionDate = new Date(startMonday);
      sessionDate.setDate(startMonday.getDate() + (week - 1) * 7 + (day.dayOfWeek - 1));

      await prisma.programSession.create({
        data: {
          assignmentId,
          scheduledDate: sessionDate,
          weekNumber: week,
          dayOfWeek: day.dayOfWeek,
          tasksSnapshot: JSON.stringify(tasksSnapshot),
        },
      });
    }
  }
}
