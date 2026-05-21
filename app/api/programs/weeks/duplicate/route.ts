import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { weekId } = await req.json();
  const source = await prisma.programWeek.findUnique({
    where: { id: weekId },
    include: {
      days: {
        include: {
          tasks: {
            include: {
              workout: { include: { exercises: true } },
              video: true,
              form: true,
              evolution: true,
            },
          },
        },
      },
    },
  });
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Última semana del programa
  const last = await prisma.programWeek.findFirst({
    where: { programId: source.programId },
    orderBy: { weekNumber: "desc" },
  });
  const newWeekNum = (last?.weekNumber ?? 0) + 1;

  const newWeek = await prisma.programWeek.create({
    data: { programId: source.programId, weekNumber: newWeekNum, notes: source.notes },
  });

  for (const day of source.days) {
    const newDay = await prisma.programDay.create({
      data: { weekId: newWeek.id, dayOfWeek: day.dayOfWeek },
    });
    for (const t of day.tasks) {
      const newTask = await prisma.programTask.create({
        data: { dayId: newDay.id, type: t.type, order: t.order, title: t.title },
      });
      if (t.type === "WORKOUT" && t.workout) {
        const w = await prisma.taskWorkout.create({
          data: { taskId: newTask.id, bodyText: t.workout.bodyText },
        });
        for (const we of t.workout.exercises) {
          await prisma.workoutExercise.create({
            data: { workoutId: w.id, exerciseId: we.exerciseId, order: we.order },
          });
        }
      } else if (t.type === "VIDEO" && t.video) {
        await prisma.taskVideo.create({
          data: { taskId: newTask.id, youtubeUrl: t.video.youtubeUrl, description: t.video.description },
        });
      } else if (t.type === "FORM" && t.form) {
        await prisma.taskForm.create({
          data: { taskId: newTask.id, questions: t.form.questions },
        });
      } else if (t.type === "EVOLUTION" && t.evolution) {
        await prisma.taskEvolution.create({
          data: { taskId: newTask.id, instructions: t.evolution.instructions },
        });
      }
    }
  }

  await prisma.program.update({
    where: { id: source.programId },
    data: { weeksCount: newWeekNum },
  });

  return NextResponse.json(newWeek);
}
