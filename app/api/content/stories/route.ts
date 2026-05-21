import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { pieceId, description } = await req.json();
  const last = await prisma.contentStory.findFirst({
    where: { pieceId },
    orderBy: { order: "desc" },
  });
  const story = await prisma.contentStory.create({
    data: {
      pieceId,
      description: description || "",
      order: (last?.order ?? -1) + 1,
    },
  });
  return NextResponse.json(story);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, description, published } = await req.json();
  const update: any = {};
  if (description !== undefined) update.description = description;
  if (published !== undefined) update.published = !!published;
  const story = await prisma.contentStory.update({ where: { id }, data: update });
  return NextResponse.json(story);
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.contentStory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
