import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { patientId, scheduledAt, type, notes } = await req.json();
  const c = await prisma.scheduledCall.create({
    data: {
      patientId,
      // scheduledAt es opcional: null = "pendiente de agendar".
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      type: type || "optimizacion",
      notes: notes || null,
    },
  });
  return NextResponse.json(c);
}

export async function PATCH(req: NextRequest) {
  const { id, completedAt, outcome, notes, scheduledAt, type } = await req.json();
  const c = await prisma.scheduledCall.update({
    where: { id },
    data: {
      ...(completedAt !== undefined && { completedAt: completedAt ? new Date(completedAt) : null }),
      ...(outcome !== undefined && { outcome: outcome || null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
      ...(type !== undefined && { type }),
    },
  });
  return NextResponse.json(c);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.scheduledCall.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
