import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: leer tarea con sus relaciones
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const task = await prisma.programTask.findUnique({
    where: { id },
    include: {
      workout: { include: { exercises: { include: { exercise: true }, orderBy: { order: "asc" } } } },
      video: true,
      form: true,
      evolution: true,
    },
  });
  return NextResponse.json(task);
}

// POST: crear tarea
export async function POST(req: NextRequest) {
  const { programId, weekId, dayOfWeek, type } = await req.json();

  // Buscar el día (debe existir, creado al crear el programa)
  let day = await prisma.programDay.findUnique({
    where: { weekId_dayOfWeek: { weekId, dayOfWeek: Number(dayOfWeek) } },
  });
  if (!day) {
    day = await prisma.programDay.create({ data: { weekId, dayOfWeek: Number(dayOfWeek) } });
  }

  const count = await prisma.programTask.count({ where: { dayId: day.id } });

  const defaultTitle =
    type === "WORKOUT" ? "Nueva sesión" :
    type === "VIDEO" ? "Nuevo vídeo" :
    type === "FORM" ? "Nuevo formulario" :
    type === "EVOLUTION" ? "Registrar evolución" :
    "Nueva tarea";

  const task = await prisma.programTask.create({
    data: { dayId: day.id, type, order: count, title: defaultTitle },
  });

  if (type === "WORKOUT") {
    await prisma.taskWorkout.create({ data: { taskId: task.id, bodyText: "" } });
  } else if (type === "VIDEO") {
    await prisma.taskVideo.create({ data: { taskId: task.id, youtubeUrl: "" } });
  } else if (type === "FORM") {
    await prisma.taskForm.create({ data: { taskId: task.id, questions: "[]" } });
  } else if (type === "EVOLUTION") {
    await prisma.taskEvolution.create({ data: { taskId: task.id } });
  }

  return NextResponse.json(task);
}

// PATCH: actualizar tarea + su contenido
export async function PATCH(req: NextRequest) {
  const { id, title, workout, video, form, evolution } = await req.json();

  await prisma.programTask.update({
    where: { id },
    data: { ...(title !== undefined && { title }) },
  });

  if (workout) {
    // Actualizar bodyText y rehacer exercises
    const w = await prisma.taskWorkout.findUnique({ where: { taskId: id } });
    if (w) {
      await prisma.taskWorkout.update({
        where: { taskId: id },
        data: { bodyText: workout.bodyText ?? "" },
      });
      await prisma.workoutExercise.deleteMany({ where: { workoutId: w.id } });
      if (Array.isArray(workout.exerciseIds)) {
        for (let i = 0; i < workout.exerciseIds.length; i++) {
          await prisma.workoutExercise.create({
            data: { workoutId: w.id, exerciseId: workout.exerciseIds[i], order: i },
          });
        }
      }
    }
  }

  if (video) {
    await prisma.taskVideo.update({
      where: { taskId: id },
      data: {
        youtubeUrl: video.youtubeUrl ?? "",
        description: video.description || null,
      },
    });
  }

  if (form) {
    await prisma.taskForm.update({
      where: { taskId: id },
      data: { questions: JSON.stringify(form.questions ?? []) },
    });
  }

  if (evolution) {
    await prisma.taskEvolution.update({
      where: { taskId: id },
      data: { instructions: evolution.instructions || null },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.programTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
