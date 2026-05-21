import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Mover o duplicar una tarea de un día a otro
// body: { taskId, targetWeekId, targetDayOfWeek, action: "move" | "duplicate" }
export async function POST(req: NextRequest) {
  const { taskId, targetWeekId, targetDayOfWeek, action } = await req.json();

  // Buscar día destino, crear si no existe
  let day = await prisma.programDay.findUnique({
    where: { weekId_dayOfWeek: { weekId: targetWeekId, dayOfWeek: Number(targetDayOfWeek) } },
  });
  if (!day) {
    day = await prisma.programDay.create({
      data: { weekId: targetWeekId, dayOfWeek: Number(targetDayOfWeek) },
    });
  }

  const count = await prisma.programTask.count({ where: { dayId: day.id } });

  if (action === "move") {
    const moved = await prisma.programTask.update({
      where: { id: taskId },
      data: { dayId: day.id, order: count },
    });
    return NextResponse.json(moved);
  }

  if (action === "duplicate") {
    const source = await prisma.programTask.findUnique({
      where: { id: taskId },
      include: {
        workout: { include: { exercises: true } },
        video: true,
        form: true,
        evolution: true,
      },
    });
    if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

    const newTask = await prisma.programTask.create({
      data: {
        dayId: day.id,
        type: source.type,
        order: count,
        title: source.title,
      },
    });

    if (source.workout) {
      const w = await prisma.taskWorkout.create({
        data: { taskId: newTask.id, bodyText: source.workout.bodyText },
      });
      for (const ex of source.workout.exercises) {
        await prisma.workoutExercise.create({
          data: {
            workoutId: w.id,
            exerciseId: ex.exerciseId,
            order: ex.order,
          },
        });
      }
    }
    if (source.video) {
      await prisma.taskVideo.create({
        data: {
          taskId: newTask.id,
          youtubeUrl: source.video.youtubeUrl,
          description: source.video.description,
        },
      });
    }
    if (source.form) {
      await prisma.taskForm.create({
        data: { taskId: newTask.id, questions: source.form.questions },
      });
    }
    if (source.evolution) {
      await prisma.taskEvolution.create({
        data: { taskId: newTask.id, instructions: source.evolution.instructions },
      });
    }

    return NextResponse.json(newTask);
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
