/**
 * Wrappers RESTful para closing-shifts:
 *   PATCH  /api/closing-shifts/[id]
 *   DELETE /api/closing-shifts/[id]
 *
 * Existen para que el frontend pueda usar la misma URL con sufijo /[id]
 * que para agenda-template. La lógica delega al endpoint principal.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

const ALLOWED_ROLES = ["ceo", "setter", "closer", "head_success"];

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { startTime, endTime, closerId } = await req.json();
  const current = await prisma.closingShift.findUnique({ where: { id: params.id } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newStart = startTime || current.startTime;
  const newEnd = endTime || current.endTime;
  if (!/^\d{2}:\d{2}$/.test(newStart) || !/^\d{2}:\d{2}$/.test(newEnd)) {
    return NextResponse.json({ error: "Hora en formato inválido" }, { status: 400 });
  }
  if (timeToMinutes(newEnd) <= timeToMinutes(newStart)) {
    return NextResponse.json({ error: "La hora de fin debe ser posterior" }, { status: 400 });
  }

  await prisma.closingShift.update({
    where: { id: params.id },
    data: {
      ...(startTime !== undefined && { startTime: newStart }),
      ...(endTime !== undefined && { endTime: newEnd }),
      ...(closerId !== undefined && { closerId }),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.closingShift.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
