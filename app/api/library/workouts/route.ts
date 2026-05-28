import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

// GET /api/library/workouts — lista las plantillas de workout (cualquier pro).
export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const items = await prisma.workoutTemplate.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(
    items.map((t) => ({
      id: t.id,
      title: t.title,
      bodyText: t.bodyText,
      exerciseIds: safeParse(t.exerciseIds),
      createdById: t.createdById,
      updatedAt: t.updatedAt.toISOString(),
    }))
  );
}

// POST /api/library/workouts — crea una nueva plantilla.
// body: { title, bodyText, exerciseIds[] }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  const bodyText = typeof b?.bodyText === "string" ? b.bodyText : "";
  const exerciseIds = Array.isArray(b?.exerciseIds)
    ? b.exerciseIds.filter((x: unknown) => typeof x === "string")
    : [];

  if (!title) return NextResponse.json({ error: "El título es obligatorio" }, { status: 400 });

  const created = await prisma.workoutTemplate.create({
    data: {
      title,
      bodyText,
      exerciseIds: JSON.stringify(exerciseIds),
      createdById: user.id,
    },
  });

  return NextResponse.json({
    id: created.id,
    title: created.title,
    bodyText: created.bodyText,
    exerciseIds,
    createdById: created.createdById,
    updatedAt: created.updatedAt.toISOString(),
  });
}

function safeParse(s: string): string[] {
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
