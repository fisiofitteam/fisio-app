import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { programId } = await req.json();
  const last = await prisma.programWeek.findFirst({
    where: { programId },
    orderBy: { weekNumber: "desc" },
  });
  const next = (last?.weekNumber ?? 0) + 1;
  const week = await prisma.programWeek.create({
    data: { programId, weekNumber: next },
  });
  // Crear 7 días vacíos
  for (let d = 1; d <= 7; d++) {
    await prisma.programDay.create({ data: { weekId: week.id, dayOfWeek: d } });
  }
  // Actualizar weeksCount del programa
  await prisma.program.update({
    where: { id: programId },
    data: { weeksCount: next },
  });
  return NextResponse.json(week);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const week = await prisma.programWeek.findUnique({ where: { id } });
  if (!week) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.programWeek.delete({ where: { id } });
  // Recompactar números
  const remaining = await prisma.programWeek.findMany({
    where: { programId: week.programId },
    orderBy: { weekNumber: "asc" },
  });
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].weekNumber !== i + 1) {
      await prisma.programWeek.update({
        where: { id: remaining[i].id },
        data: { weekNumber: i + 1 },
      });
    }
  }
  await prisma.program.update({
    where: { id: week.programId },
    data: { weeksCount: remaining.length },
  });
  return NextResponse.json({ ok: true });
}
