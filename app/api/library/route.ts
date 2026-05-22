import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("q")?.toLowerCase() ?? "";
  const category = req.nextUrl.searchParams.get("category");
  const exercises = await prisma.exerciseLibrary.findMany({
    where: {
      AND: [
        category ? { category } : {},
        search ? { OR: [{ name: { contains: search } }, { tags: { contains: search } }] } : {},
      ],
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(exercises);
}

export async function POST(req: NextRequest) {
  const { name, bodyZone, category, tags, youtubeUrl, description } = await req.json();
  const ex = await prisma.exerciseLibrary.create({
    data: {
      name,
      bodyZone: bodyZone || "otros",
      category,
      tags: tags || "",
      youtubeUrl: youtubeUrl || null,
      description: description || null,
    },
  });
  return NextResponse.json(ex);
}

export async function PATCH(req: NextRequest) {
  const { id, name, bodyZone, category, tags, youtubeUrl, description } = await req.json();
  const ex = await prisma.exerciseLibrary.update({
    where: { id },
    data: {
      name,
      ...(bodyZone !== undefined && { bodyZone: bodyZone || "otros" }),
      category,
      tags: tags || "",
      youtubeUrl: youtubeUrl || null,
      description: description || null,
    },
  });
  return NextResponse.json(ex);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  // Borramos también las referencias en workouts (no las copiamos, pero por si acaso)
  await prisma.workoutExercise.deleteMany({ where: { exerciseId: id } });
  await prisma.exerciseLibrary.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
