import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { type, category, amount, description, occurredAt, professionalId, patientId } = await req.json();
  const t = await prisma.transaction.create({
    data: {
      type,
      category: category || null,
      amount: Number(amount),
      description: description || null,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      professionalId: professionalId || null,
      patientId: patientId || null,
    },
  });
  return NextResponse.json(t);
}

export async function PATCH(req: NextRequest) {
  const { id, type, category, amount, description, occurredAt, professionalId, patientId } = await req.json();
  const t = await prisma.transaction.update({
    where: { id },
    data: {
      ...(type !== undefined && { type }),
      ...(category !== undefined && { category: category || null }),
      ...(amount !== undefined && { amount: Number(amount) }),
      ...(description !== undefined && { description: description || null }),
      ...(occurredAt !== undefined && { occurredAt: new Date(occurredAt) }),
      ...(professionalId !== undefined && { professionalId: professionalId || null }),
      ...(patientId !== undefined && { patientId: patientId || null }),
    },
  });
  return NextResponse.json(t);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.transaction.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
