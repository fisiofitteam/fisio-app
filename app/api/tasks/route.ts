import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function nextRecurrenceDate(recurrenceType: string, recurrenceDay: number | null, fromDate: Date): Date | null {
  const result = new Date(fromDate);
  result.setHours(9, 0, 0, 0);

  if (recurrenceType === "daily") {
    result.setDate(result.getDate() + 1);
    return result;
  }
  if (recurrenceType === "weekly") {
    if (!recurrenceDay) return null;
    result.setDate(result.getDate() + 7);
    return result;
  }
  if (recurrenceType === "monthly") {
    if (!recurrenceDay) return null;
    result.setMonth(result.getMonth() + 1);
    const desiredDay = recurrenceDay;
    const lastDayOfMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(desiredDay, lastDayOfMonth));
    return result;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    title, description, patientId, dueDate, source, assignedBy, assignedTo, priority,
    recurrenceType, recurrenceDay,
    recurrenceAdvanced, // { daysOfWeek: [1..7], intervalWeeks: 1, durationWeeks?: 4, untilDate?: "YYYY-MM-DD" }
  } = body;

  const baseData = {
    title,
    description: description || null,
    patientId: patientId || null,
    source: source || "own",
    assignedBy: assignedBy || null,
    assignedTo: assignedTo || null,
    priority: priority || "medium",
  };

  // Modo avanzado: generar instancias por cada día seleccionado en N semanas.
  if (recurrenceAdvanced && Array.isArray(recurrenceAdvanced.daysOfWeek) && recurrenceAdvanced.daysOfWeek.length > 0 && dueDate) {
    const start = new Date(dueDate);
    start.setHours(9, 0, 0, 0);
    const daysOfWeek: number[] = recurrenceAdvanced.daysOfWeek
      .map((d: any) => Number(d))
      .filter((d: number) => d >= 1 && d <= 7);
    const intervalWeeks = Math.max(1, Math.round(Number(recurrenceAdvanced.intervalWeeks) || 1));
    const durationWeeks = Number(recurrenceAdvanced.durationWeeks);
    const untilDateStr = recurrenceAdvanced.untilDate;
    const untilDate: Date | null = untilDateStr ? new Date(untilDateStr) : null;
    if (untilDate) untilDate.setHours(23, 59, 59, 999);

    // Calcula el lunes de la semana de start (ISO: lunes=1).
    const startDow = start.getDay() === 0 ? 7 : start.getDay();
    const mondayOfStart = new Date(start);
    mondayOfStart.setDate(start.getDate() - (startDow - 1));

    // Determinamos cuántas semanas iterar.
    const maxWeeks = Number.isFinite(durationWeeks) && durationWeeks > 0
      ? Math.round(durationWeeks)
      : untilDate
        ? Math.ceil((untilDate.getTime() - mondayOfStart.getTime()) / (7 * 86400 * 1000)) + 1
        : 1;

    const dates: Date[] = [];
    for (let w = 0; w < maxWeeks; w++) {
      // Solo semanas que coincidan con el intervalo.
      if (w % intervalWeeks !== 0) continue;
      const weekMonday = new Date(mondayOfStart);
      weekMonday.setDate(mondayOfStart.getDate() + w * 7);
      for (const dow of daysOfWeek) {
        const d = new Date(weekMonday);
        d.setDate(weekMonday.getDate() + (dow - 1));
        d.setHours(9, 0, 0, 0);
        if (d < start) continue;
        if (untilDate && d > untilDate) continue;
        dates.push(d);
      }
    }
    dates.sort((a, b) => a.getTime() - b.getTime());
    if (dates.length === 0) {
      return NextResponse.json({ error: "Recurrencia sin fechas válidas" }, { status: 400 });
    }

    // Crear master + clones (todos con parentTaskId apuntando al master).
    const [first, ...rest] = dates;
    const master = await prisma.fisioTask.create({
      data: { ...baseData, recurrenceType: "none", dueDate: first },
    });
    if (rest.length > 0) {
      await prisma.fisioTask.createMany({
        data: rest.map((d) => ({ ...baseData, recurrenceType: "none", parentTaskId: master.id, dueDate: d })),
      });
    }
    return NextResponse.json({ ...master, createdCount: dates.length });
  }

  // Modo clásico (sin recurrencia, o recurrencia simple legacy).
  const t = await prisma.fisioTask.create({
    data: {
      ...baseData,
      recurrenceType: recurrenceType || "none",
      recurrenceDay: recurrenceDay ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  });
  return NextResponse.json(t);
}

export async function PATCH(req: NextRequest) {
  const { id, title, description, patientId, dueDate, completedAt, source, assignedBy, assignedTo, priority, recurrenceType, recurrenceDay } = await req.json();

  if (completedAt) {
    const current = await prisma.fisioTask.findUnique({ where: { id } });
    if (current && current.recurrenceType !== "none" && !current.completedAt) {
      const baseDate = current.dueDate ?? new Date();
      const next = nextRecurrenceDate(current.recurrenceType, current.recurrenceDay, baseDate);
      if (next) {
        await prisma.fisioTask.create({
          data: {
            title: current.title,
            description: current.description,
            patientId: current.patientId,
            source: current.source,
            assignedBy: current.assignedBy,
            assignedTo: current.assignedTo,
            priority: current.priority,
            recurrenceType: current.recurrenceType,
            recurrenceDay: current.recurrenceDay,
            parentTaskId: current.parentTaskId ?? current.id,
            dueDate: next,
          },
        });
      }
    }
  }

  const t = await prisma.fisioTask.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description: description || null }),
      ...(patientId !== undefined && { patientId: patientId || null }),
      ...(source !== undefined && { source }),
      ...(assignedBy !== undefined && { assignedBy: assignedBy || null }),
      ...(assignedTo !== undefined && { assignedTo: assignedTo || null }),
      ...(priority !== undefined && { priority }),
      ...(recurrenceType !== undefined && { recurrenceType: recurrenceType || "none" }),
      ...(recurrenceDay !== undefined && { recurrenceDay: recurrenceDay ?? null }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(completedAt !== undefined && { completedAt: completedAt ? new Date(completedAt) : null }),
    },
  });
  return NextResponse.json(t);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.fisioTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
