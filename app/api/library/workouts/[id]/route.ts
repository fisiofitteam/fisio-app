import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

// PATCH /api/library/workouts/[id] — actualiza título, body y/o ejercicios.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof b?.title === "string" && b.title.trim()) data.title = b.title.trim();
  if (typeof b?.bodyText === "string") data.bodyText = b.bodyText;
  if (Array.isArray(b?.exerciseIds)) {
    data.exerciseIds = JSON.stringify(b.exerciseIds.filter((x: unknown) => typeof x === "string"));
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
  }
  const updated = await prisma.workoutTemplate.update({ where: { id: params.id }, data });
  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    bodyText: updated.bodyText,
    exerciseIds: safeParse(updated.exerciseIds),
    updatedAt: updated.updatedAt.toISOString(),
  });
}

// DELETE /api/library/workouts/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.workoutTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

function safeParse(s: string): string[] {
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
