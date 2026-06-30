import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSessions } from "@/lib/programs";

// Normaliza una fecha al inicio del día (sin tocar la zona horaria).
// startDate ahora se respeta tal cual (día exacto que el fisio eligió),
// ya no se fuerza el lunes anterior.
function startOfDay(input: string | Date): Date {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function POST(req: NextRequest) {
  const { patientId, programId, startDate, weeksCount } = await req.json();

  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    return NextResponse.json({ error: "program not found" }, { status: 404 });
  }

  // El programa empieza el día EXACTO que eligió el fisio. "Día 1" del
  // programa = ese día. Día 3 = ese día + 2. Si elige domingo, día 1 es
  // domingo y día 3 cae en martes.
  const start = startOfDay(startDate);

  const assignment = await prisma.programAssignment.create({
    data: {
      patientId,
      programId,
      startDate: start,
      weeksCount: Number(weeksCount) || program.weeksCount,
      isActive: true,
    },
  });

  await generateSessions(assignment.id);
  return NextResponse.json(assignment);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.programAssignment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

/**
 * PATCH: editar una asignación.
 *
 * Soporta:
 *  - isActive: desactivar el programa (sesiones quedan como histórico)
 *  - startDate: cambiar fecha de inicio (mueve sesiones futuras no completadas)
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, isActive, startDate } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const current = await prisma.programAssignment.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: any = {};

  // Cambio de fecha → mover sesiones futuras no completadas
  if (startDate !== undefined) {
    const newStart = startOfDay(startDate);
    const oldStart = current.startDate;
    const diffDays = Math.round((newStart.getTime() - oldStart.getTime()) / 86400000);

    if (diffDays !== 0) {
      // Sólo sesiones futuras no completadas
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sessions = await prisma.programSession.findMany({
        where: {
          assignmentId: id,
          completedAt: null,
          scheduledDate: { gte: today },
        },
      });
      for (const s of sessions) {
        const newDate = new Date(s.scheduledDate.getTime() + diffDays * 86400000);
        await prisma.programSession.update({
          where: { id: s.id },
          data: { scheduledDate: newDate },
        });
      }
    }
    data.startDate = newStart;
  }

  if (isActive !== undefined) {
    data.isActive = isActive;
    // Si se desactiva: borrar sesiones futuras no completadas (conservar pasadas + completadas)
    if (isActive === false) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.programSession.deleteMany({
        where: {
          assignmentId: id,
          scheduledDate: { gte: today },
          completedAt: null,
        },
      });
    }
  }

  const updated = await prisma.programAssignment.update({ where: { id }, data });
  return NextResponse.json(updated);
}
