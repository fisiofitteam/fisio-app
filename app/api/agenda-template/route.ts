/**
 * GET  /api/agenda-template       → devuelve la plantilla actual
 * POST /api/agenda-template       → crea franja en la plantilla
 * PATCH /api/agenda-template/[id] → edita franja
 * DELETE /api/agenda-template/[id] → borra franja
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

const ALLOWED_ROLES = ["ceo", "setter", "closer", "head_success"];

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const shifts = await prisma.defaultClosingShift.findMany({
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    include: { closer: { select: { id: true, fullName: true, role: true } } },
  });

  return NextResponse.json({
    shifts: shifts.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      closerId: s.closerId,
      closer: s.closer,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { dayOfWeek, startTime, endTime, closerId } = await req.json();
  if (!dayOfWeek || !startTime || !endTime || !closerId) {
    return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
  }
  if (dayOfWeek < 1 || dayOfWeek > 7) {
    return NextResponse.json({ error: "dayOfWeek inválido" }, { status: 400 });
  }
  if (!/^[0-2][0-9]:[0-5][0-9]$/.test(startTime) || !/^[0-2][0-9]:[0-5][0-9]$/.test(endTime)) {
    return NextResponse.json({ error: "Formato HH:MM" }, { status: 400 });
  }

  const created = await prisma.defaultClosingShift.create({
    data: { dayOfWeek, startTime, endTime, closerId },
  });

  return NextResponse.json({ ok: true, id: created.id });
}
