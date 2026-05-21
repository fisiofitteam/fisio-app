import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { profileId, name } = await req.json();
  // Calcular próximo order
  const last = await prisma.clinicalLevel.findFirst({
    where: { profileId },
    orderBy: { order: "desc" },
  });
  const nextOrder = (last?.order ?? 0) + 1;
  const level = await prisma.clinicalLevel.create({
    data: { profileId, name, order: nextOrder },
  });
  return NextResponse.json(level);
}

export async function PATCH(req: NextRequest) {
  const { id, name, description } = await req.json();
  const updated = await prisma.clinicalLevel.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description: description || null }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  // Quitar referencias en pacientes antes de borrar
  await prisma.patient.updateMany({
    where: { appliedLevelId: id },
    data: { appliedLevelId: null },
  });

  await prisma.clinicalLevel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
