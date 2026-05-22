import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { weekStartDate } from "@/lib/program-pauses";

// GET: una semana concreta (programId + lunes) o lista del programa --------

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const programId = req.nextUrl.searchParams.get("programId");
  const weekDate = req.nextUrl.searchParams.get("weekDate"); // ISO opcional
  if (!programId) return NextResponse.json({ error: "programId required" }, { status: 400 });

  // Si pasas weekDate → devolvemos esa semana con sus días y tareas
  if (weekDate) {
    const monday = weekStartDate(new Date(weekDate));
    const week = await prisma.rollingWeek.findUnique({
      where: { programId_weekStartDate: { programId, weekStartDate: monday } },
      include: {
        days: {
          include: { tasks: { orderBy: { order: "asc" } } },
          orderBy: { dayOfWeek: "asc" },
        },
      },
    });
    return NextResponse.json({ week, mondayIso: monday.toISOString() });
  }

  // Sin weekDate → lista (para vista índice del programa)
  const weeks = await prisma.rollingWeek.findMany({
    where: { programId },
    orderBy: { weekStartDate: "desc" },
    include: { _count: { select: { days: true } } },
  });
  return NextResponse.json({ weeks });
}

// POST: crear semana (sin contenido aún) o publicar/despublicar ------------

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "ceo" || user.role === "head_success" || user.role === "fisio")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { programId, weekStartDate: wsd, title, notes, publish } = await req.json();
  if (!programId || !wsd) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  const monday = weekStartDate(new Date(wsd));

  const existing = await prisma.rollingWeek.findUnique({
    where: { programId_weekStartDate: { programId, weekStartDate: monday } },
  });

  if (existing) {
    const updated = await prisma.rollingWeek.update({
      where: { id: existing.id },
      data: {
        ...(title !== undefined && { title: title?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(publish !== undefined && {
          publishedAt: publish ? (existing.publishedAt || new Date()) : null,
        }),
      },
    });
    return NextResponse.json({ ok: true, weekId: updated.id });
  }

  const week = await prisma.rollingWeek.create({
    data: {
      programId,
      weekStartDate: monday,
      title: title?.trim() || null,
      notes: notes?.trim() || null,
      publishedAt: publish ? new Date() : null,
    },
  });
  return NextResponse.json({ ok: true, weekId: week.id });
}

// DELETE: borrar semana ------------------------------------------------------

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.rollingWeek.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
