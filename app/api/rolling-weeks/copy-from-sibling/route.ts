/**
 * POST /api/rolling-weeks/copy-from-sibling
 *
 * Clona la semana (mismo weekStartDate) del programa "hermano" al programa
 * destino. Ahorra tener que replicar a mano cuando el contenido de
 * Prevention y Accesorios de Advance conviene mantenerlos alineados.
 *
 * Mapping:
 *   - destino con role="prevention"          → hermano con role="advance-accesorios"
 *   - destino con role="advance-accesorios"  → hermano con role="prevention"
 *   - resto de roles: 400 (no aplica)
 *
 * Se toma el primer RollingProgram del rol hermano (isActive=true, orderBy
 * createdAt asc). Si hay varios, se puede ampliar más adelante para
 * elegir; por ahora igual que ensurePreventionRollingProgram.
 *
 * Comportamiento en el destino:
 *   - Si la semana destino ya tiene contenido → sobrescribe (borra los
 *     días existentes en cascada). El usuario confirma en el UI.
 *   - Si no tiene semana → la crea en borrador.
 *
 * Solo CEO, head_success o fisio.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { weekStartDate } from "@/lib/program-pauses";

const SIBLING_ROLE: Record<string, string> = {
  "prevention": "advance-accesorios",
  "advance-accesorios": "prevention",
};

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "ceo" || user.role === "head_success" || user.role === "fisio")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const targetProgramId = typeof body?.programId === "string" ? body.programId : "";
  const wsd = typeof body?.weekStartDate === "string" ? body.weekStartDate : "";
  if (!targetProgramId || !wsd) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }
  const monday = weekStartDate(new Date(wsd));

  // 1. Programa destino + rol
  const targetProgram = await prisma.rollingProgram.findUnique({
    where: { id: targetProgramId },
    select: { id: true, role: true, name: true },
  });
  if (!targetProgram) {
    return NextResponse.json({ error: "Programa destino no encontrado" }, { status: 404 });
  }
  const siblingRole = SIBLING_ROLE[targetProgram.role];
  if (!siblingRole) {
    return NextResponse.json(
      { error: `El rol "${targetProgram.role}" no tiene programa hermano — esta acción solo aplica a Prevention y Advance Accesorios.` },
      { status: 400 },
    );
  }

  // 2. Programa hermano (primer activo del rol correspondiente)
  const siblingProgram = await prisma.rollingProgram.findFirst({
    where: { role: siblingRole, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!siblingProgram) {
    return NextResponse.json(
      { error: `No hay ningún programa activo de rol "${siblingRole}" para copiar.` },
      { status: 404 },
    );
  }

  // 3. Semana origen con contenido
  const sourceWeek = await prisma.rollingWeek.findUnique({
    where: {
      programId_weekStartDate: { programId: siblingProgram.id, weekStartDate: monday },
    },
    include: {
      days: {
        orderBy: { dayOfWeek: "asc" },
        include: {
          tasks: {
            orderBy: { order: "asc" },
            include: {
              exercises: { orderBy: { order: "asc" }, select: { exerciseId: true, order: true } },
            },
          },
        },
      },
    },
  });
  if (!sourceWeek || sourceWeek.days.length === 0) {
    return NextResponse.json(
      { error: `El programa "${siblingProgram.name}" no tiene contenido en esa semana.` },
      { status: 404 },
    );
  }

  // 4. Ejecutar copia en transacción
  //    - Borrar cascada los días existentes del destino (limpia tasks y exercises por FK onDelete Cascade).
  //    - Recrear días + tasks + exercises con los IDs nuevos.
  const totals = { days: 0, tasks: 0, exercises: 0 };
  await prisma.$transaction(async (tx) => {
    // upsert semana destino manteniendo publishedAt (si estaba publicada,
    // sigue publicada tras la copia)
    const destWeek = await tx.rollingWeek.upsert({
      where: {
        programId_weekStartDate: { programId: targetProgramId, weekStartDate: monday },
      },
      create: {
        programId: targetProgramId,
        weekStartDate: monday,
        title: sourceWeek.title,
        notes: sourceWeek.notes,
      },
      update: {
        // No pisamos title/notes si ya existían en el destino
      },
    });

    // Limpiar días existentes
    await tx.rollingDay.deleteMany({ where: { weekId: destWeek.id } });

    // Recrear estructura
    for (const day of sourceWeek.days) {
      const newDay = await tx.rollingDay.create({
        data: { weekId: destWeek.id, dayOfWeek: day.dayOfWeek },
      });
      totals.days += 1;
      for (const task of day.tasks) {
        const newTask = await tx.rollingTask.create({
          data: {
            dayId: newDay.id,
            type: task.type,
            title: task.title,
            order: task.order,
            bodyText: task.bodyText,
            videoId: task.videoId,
            formId: task.formId,
          },
        });
        totals.tasks += 1;
        if (task.exercises.length > 0) {
          await tx.rollingTaskExercise.createMany({
            data: task.exercises.map((e) => ({
              rollingTaskId: newTask.id,
              exerciseId: e.exerciseId,
              order: e.order,
            })),
          });
          totals.exercises += task.exercises.length;
        }
      }
    }
  });

  return NextResponse.json({
    ok: true,
    siblingProgramName: siblingProgram.name,
    ...totals,
  });
}
