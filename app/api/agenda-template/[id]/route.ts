import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

const ALLOWED_ROLES = ["ceo", "setter", "closer", "head_success"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { startTime, endTime, closerId } = await req.json();
  const data: any = {};
  if (startTime !== undefined) {
    if (!/^[0-2][0-9]:[0-5][0-9]$/.test(startTime)) {
      return NextResponse.json({ error: "Formato HH:MM" }, { status: 400 });
    }
    data.startTime = startTime;
  }
  if (endTime !== undefined) {
    if (!/^[0-2][0-9]:[0-5][0-9]$/.test(endTime)) {
      return NextResponse.json({ error: "Formato HH:MM" }, { status: 400 });
    }
    data.endTime = endTime;
  }
  if (closerId !== undefined) data.closerId = closerId;

  await prisma.defaultClosingShift.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.defaultClosingShift.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
