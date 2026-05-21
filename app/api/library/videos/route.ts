import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const videos = await prisma.videoLibrary.findMany({
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  return NextResponse.json(videos);
}

export async function POST(req: NextRequest) {
  const { title, youtubeUrl, description, category, tags } = await req.json();
  const v = await prisma.videoLibrary.create({
    data: { title, youtubeUrl, description: description || null, category: category || "Educacional", tags: tags || "" },
  });
  return NextResponse.json(v);
}

export async function PATCH(req: NextRequest) {
  const { id, title, youtubeUrl, description, category, tags } = await req.json();
  const v = await prisma.videoLibrary.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(youtubeUrl !== undefined && { youtubeUrl }),
      ...(description !== undefined && { description: description || null }),
      ...(category !== undefined && { category }),
      ...(tags !== undefined && { tags }),
    },
  });
  return NextResponse.json(v);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.videoLibrary.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
