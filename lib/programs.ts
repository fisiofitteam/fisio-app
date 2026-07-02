import { prisma } from "./prisma";

// Etiquetas de día relativas al inicio del programa. El "dayOfWeek" en
// ProgramDay ya NO representa el día absoluto de la semana, sino la
// posición dentro del programa (1 = primer día, 7 = séptimo día). Las
// constantes mantienen el nombre por compatibilidad histórica.
export const DAY_NAMES = ["", "Día 1", "Día 2", "Día 3", "Día 4", "Día 5", "Día 6", "Día 7"];
export const DAY_SHORT = ["", "D1", "D2", "D3", "D4", "D5", "D6", "D7"];

// Helper histórico — devuelve el lunes de la semana que contiene a `date`.
// Ya no se usa en generateSessions (el programa empieza el día que elija el
// fisio, no se alinea al lunes), pero se exporta por si otros módulos
// quieren localizar "el lunes de…" para semanas de calendario.
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

  // startDate ya NO se alinea al lunes. Es el día real que el fisio
  // eligió como inicio del programa para este paciente. Por tanto,
  // ProgramDay.dayOfWeek=1 cae en assignment.startDate, dayOfWeek=2
  // al día siguiente, etc.
  const startDay = new Date(assignment.startDate);
  startDay.setHours(0, 0, 0, 0);

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
      // Los ProgramDay del editor siempre se crean para los 7 días de
      // la semana, aunque el fisio solo ponga tareas en algunos. Si un
      // día está vacío, NO generamos ProgramSession para él — así el
      // paciente no ve tarjetas "0 tareas" y, sobre todo, no aparecen
      // días "en blanco" cuando tiene varios programas asignados a la
      // vez (antes cada programa generaba 7 sesiones/semana y las
      // vacías tapaban las llenas del otro programa).
      if (day.tasks.length === 0) continue;

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

      const sessionDate = new Date(startDay);
      sessionDate.setDate(startDay.getDate() + (week - 1) * 7 + (day.dayOfWeek - 1));

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
