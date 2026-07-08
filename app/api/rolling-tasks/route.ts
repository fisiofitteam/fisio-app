import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

/**
 * POST /api/rolling-tasks
 * Crear una tarea dentro de un día de una semana rolling.
 * Body: { weekId, dayOfWeek, type }
 */
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { weekId, dayOfWeek, type } = await req.json();
  if (!weekId || !dayOfWeek || !type) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  // Asegurar que el día existe (lo creamos si no)
  let day = await prisma.rollingDay.findUnique({
    where: { weekId_dayOfWeek: { weekId, dayOfWeek: Number(dayOfWeek) } },
  });
  if (!day) {
    day = await prisma.rollingDay.create({ data: { weekId, dayOfWeek: Number(dayOfWeek) } });
  }

  const count = await prisma.rollingTask.count({ where: { dayId: day.id } });

  const defaultTitle =
    type === "WORKOUT" ? "Nueva sesión" :
    type === "VIDEO" ? "Nuevo vídeo" :
    type === "FORM" ? "Nuevo formulario" :
    type === "EVOLUTION" ? "Registrar evolución" :
    "Nueva tarea";

  const task = await prisma.rollingTask.create({
    data: {
      dayId: day.id,
      type,
      order: count,
      title: defaultTitle,
      bodyText: type === "WORKOUT" ? "" : null,
    },
  });

  return NextResponse.json(task);
}

/**
 * GET /api/rolling-tasks?id=xxx
 * Leer una tarea con todo su contenido (incluye ejercicios vinculados).
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const task = await prisma.rollingTask.findUnique({
    where: { id },
    include: {
      exercises: {
        orderBy: { order: "asc" },
        include: { exercise: true },
      },
    },
  });
  return NextResponse.json(task);
}

/**
 * PATCH /api/rolling-tasks
 * Actualizar título / payload. Si viene `exerciseIds` (array de ids del
 * catálogo ExerciseLibrary), sincroniza los ejercicios enlazados: borra los
 * que ya no estén y añade los nuevos, respetando el orden del array.
 */
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, title, bodyText, videoId, formId, exerciseIds } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const task = await prisma.rollingTask.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(bodyText !== undefined && { bodyText: bodyText || null }),
      ...(videoId !== undefined && { videoId: videoId || null }),
      ...(formId !== undefined && { formId: formId || null }),
    },
  });

  if (Array.isArray(exerciseIds)) {
    // Reset y recrea con el orden del array recibido. Como el join tiene
    // unique(rollingTaskId, exerciseId), duplicados llegarían a chocar; los
    // dedupeamos con un Set preservando el orden.
    const clean: string[] = [];
    const seen = new Set<string>();
    for (const eid of exerciseIds) {
      if (typeof eid === "string" && eid && !seen.has(eid)) {
        seen.add(eid);
        clean.push(eid);
      }
    }
    await prisma.rollingTaskExercise.deleteMany({ where: { rollingTaskId: id } });
    if (clean.length > 0) {
      await prisma.rollingTaskExercise.createMany({
        data: clean.map((eid, idx) => ({ rollingTaskId: id, exerciseId: eid, order: idx })),
      });
    }
  }

  return NextResponse.json(task);
}

/**
 * DELETE /api/rolling-tasks?id=xxx
 */
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.rollingTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

/**
 * PUT /api/rolling-tasks (move/duplicate entre días o semanas)
 * Body: { taskId, action: "move"|"duplicate", targetWeekId, targetDayOfWeek }
 */
export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { taskId, action, targetWeekId, targetDayOfWeek } = await req.json();
  if (!taskId || !action || !targetWeekId || !targetDayOfWeek) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  const task = await prisma.rollingTask.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

  // Asegurar día destino
  let day = await prisma.rollingDay.findUnique({
    where: { weekId_dayOfWeek: { weekId: targetWeekId, dayOfWeek: Number(targetDayOfWeek) } },
  });
  if (!day) {
    day = await prisma.rollingDay.create({
      data: { weekId: targetWeekId, dayOfWeek: Number(targetDayOfWeek) },
    });
  }

  const count = await prisma.rollingTask.count({ where: { dayId: day.id } });

  if (action === "move") {
    await prisma.rollingTask.update({
      where: { id: taskId },
      data: { dayId: day.id, order: count },
    });
  } else if (action === "duplicate") {
    await prisma.rollingTask.create({
      data: {
        dayId: day.id,
        type: task.type,
        title: task.title,
        order: count,
        bodyText: task.bodyText,
        videoId: task.videoId,
        formId: task.formId,
      },
    });
  } else {
    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
