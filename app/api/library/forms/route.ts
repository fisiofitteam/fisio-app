import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const forms = await prisma.formLibrary.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(forms);
}

export async function POST(req: NextRequest) {
  const { name, description, questions } = await req.json();
  const f = await prisma.formLibrary.create({
    data: { name, description: description || null, questions: JSON.stringify(questions ?? []) },
  });
  return NextResponse.json(f);
}

export async function PATCH(req: NextRequest) {
  const { id, name, description, questions } = await req.json();
  const f = await prisma.formLibrary.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description: description || null }),
      ...(questions !== undefined && { questions: JSON.stringify(questions) }),
    },
  });
  return NextResponse.json(f);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.formLibrary.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
