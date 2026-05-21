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
  const { title, description, patientId, dueDate, source, assignedBy, assignedTo, priority, recurrenceType, recurrenceDay } = await req.json();
  const t = await prisma.fisioTask.create({
    data: {
      title,
      description: description || null,
      patientId: patientId || null,
      source: source || "own",
      assignedBy: assignedBy || null,
      assignedTo: assignedTo || null,
      priority: priority || "medium",
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
