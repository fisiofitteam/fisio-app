import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sourceId, name, bodyZone, type, level, weeksCount, description } = body;

  // Si viene sourceId, duplicar el programa con todo su contenido
  if (sourceId) {
    const source = await prisma.program.findUnique({
      where: { id: sourceId },
      include: {
        weeks: {
          orderBy: { weekNumber: "asc" },
          include: {
            days: {
              orderBy: { dayOfWeek: "asc" },
              include: {
                tasks: {
                  orderBy: { order: "asc" },
                  include: { workout: { include: { exercises: true } }, video: true, form: true, evolution: true },
                },
              },
            },
          },
        },
      },
    });
    if (!source) return NextResponse.json({ error: "source not found" }, { status: 404 });

    const newProgram = await prisma.program.create({
      data: {
        name: name || `${source.name} (copia)`,
        bodyZone: bodyZone || source.bodyZone,
        type: type || source.type,
        level: level ?? source.level,
        weeksCount: source.weeksCount,
        description: description ?? source.description,
      },
    });

    for (const w of source.weeks) {
      const newWeek = await prisma.programWeek.create({
        data: { programId: newProgram.id, weekNumber: w.weekNumber },
      });
      for (const d of w.days) {
        const newDay = await prisma.programDay.create({
          data: { weekId: newWeek.id, dayOfWeek: d.dayOfWeek },
        });
        for (const t of d.tasks) {
          const newTask = await prisma.programTask.create({
            data: {
              dayId: newDay.id,
              type: t.type,
              order: t.order,
              title: t.title,
            },
          });
          if (t.workout) {
            const newWorkout = await prisma.taskWorkout.create({
              data: {
                taskId: newTask.id,
                bodyText: t.workout.bodyText,
              },
            });
            for (const ex of t.workout.exercises) {
              await prisma.workoutExercise.create({
                data: {
                  workoutId: newWorkout.id,
                  exerciseId: ex.exerciseId,
                  order: ex.order,
                },
              });
            }
          }
          if (t.video) {
            await prisma.taskVideo.create({
              data: {
                taskId: newTask.id,
                youtubeUrl: t.video.youtubeUrl,
                description: t.video.description,
              },
            });
          }
          if (t.form) {
            await prisma.taskForm.create({
              data: { taskId: newTask.id, questions: t.form.questions },
            });
          }
          if (t.evolution) {
            await prisma.taskEvolution.create({
              data: {
                taskId: newTask.id,
                instructions: t.evolution.instructions,
              },
            });
          }
        }
      }
    }

    return NextResponse.json(newProgram);
  }

  // Crear nuevo programa vacío
  const program = await prisma.program.create({
    data: {
      name,
      bodyZone: bodyZone || "otros",
      type,
      level: Number(level) || 1,
      weeksCount: Number(weeksCount) || 4,
      description: description || null,
    },
  });

  // Crear las semanas y los 7 días vacíos
  for (let w = 1; w <= program.weeksCount; w++) {
    const week = await prisma.programWeek.create({
      data: { programId: program.id, weekNumber: w },
    });
    for (let d = 1; d <= 7; d++) {
      await prisma.programDay.create({ data: { weekId: week.id, dayOfWeek: d } });
    }
  }

  return NextResponse.json(program);
}

export async function PATCH(req: NextRequest) {
  const { id, name, bodyZone, type, level, description } = await req.json();
  const program = await prisma.program.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(bodyZone !== undefined && { bodyZone }),
      ...(type !== undefined && { type }),
      ...(level !== undefined && { level: Number(level) }),
      ...(description !== undefined && { description: description || null }),
    },
  });
  return NextResponse.json(program);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.program.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
