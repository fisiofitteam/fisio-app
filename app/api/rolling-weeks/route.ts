import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { weekStartDate } from "@/lib/program-pauses";

// GET: semanas de un programa rolling ----------------------------------------

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const programId = req.nextUrl.searchParams.get("programId");
  if (!programId) return NextResponse.json({ error: "programId required" }, { status: 400 });

  const weeks = await prisma.rollingWeek.findMany({
    where: { programId },
    orderBy: { weekStartDate: "desc" },
  });
  return NextResponse.json(weeks);
}

// POST: crear (o re-publicar) una semana -------------------------------------

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "ceo" || user.role === "head_success" || user.role === "fisio")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { programId, weekStartDate: wsd, title, notes, contentJson, publish } = await req.json();
  if (!programId || !wsd) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  // Forzar al lunes de esa semana
  const monday = weekStartDate(new Date(wsd));

  // Si ya existe la semana → upsert
  const existing = await prisma.rollingWeek.findUnique({
    where: { programId_weekStartDate: { programId, weekStartDate: monday } },
  });

  if (existing) {
    const updated = await prisma.rollingWeek.update({
      where: { id: existing.id },
      data: {
        title: title?.trim() || null,
        notes: notes?.trim() || null,
        contentJson: contentJson || "{}",
        publishedAt: publish ? (existing.publishedAt || new Date()) : null,
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
      contentJson: contentJson || "{}",
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
