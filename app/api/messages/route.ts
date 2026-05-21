import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { name, category, body } = await req.json();
  const m = await prisma.messageTemplate.create({
    data: { name, category: category || "Otros", body },
  });
  return NextResponse.json(m);
}

export async function PATCH(req: NextRequest) {
  const { id, name, category, body } = await req.json();
  const m = await prisma.messageTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(category !== undefined && { category }),
      ...(body !== undefined && { body }),
    },
  });
  return NextResponse.json(m);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.messageTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
