/**
 * GET    /api/agenda-blocks       → lista bloqueos próximos
 * POST   /api/agenda-blocks       → crear bloqueo (día entero o franja)
 * DELETE /api/agenda-blocks/[id]  → eliminar bloqueo
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

  // Bloqueos desde hoy en adelante
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const blocks = await prisma.agendaBlock.findMany({
    where: { blockedDate: { gte: now } },
    orderBy: { blockedDate: "asc" },
  });

  return NextResponse.json({
    blocks: blocks.map((b) => ({
      id: b.id,
      blockedDate: b.blockedDate.toISOString().slice(0, 10),
      blockedStartTime: b.blockedStartTime,
      blockedEndTime: b.blockedEndTime,
      reason: b.reason,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { blockedDate, blockedStartTime, blockedEndTime, reason } = await req.json();
  if (!blockedDate || !/^\d{4}-\d{2}-\d{2}$/.test(blockedDate)) {
    return NextResponse.json({ error: "blockedDate YYYY-MM-DD requerido" }, { status: 400 });
  }
  if (blockedStartTime && !/^[0-2][0-9]:[0-5][0-9]$/.test(blockedStartTime)) {
    return NextResponse.json({ error: "blockedStartTime HH:MM" }, { status: 400 });
  }
  if (blockedEndTime && !/^[0-2][0-9]:[0-5][0-9]$/.test(blockedEndTime)) {
    return NextResponse.json({ error: "blockedEndTime HH:MM" }, { status: 400 });
  }

  // Guardamos la fecha como 12:00 UTC para evitar problemas DST
  const dateObj = new Date(blockedDate + "T12:00:00Z");

  const created = await prisma.agendaBlock.create({
    data: {
      blockedDate: dateObj,
      blockedStartTime: blockedStartTime || null,
      blockedEndTime: blockedEndTime || null,
      reason: reason || null,
      createdBy: user.id,
    },
  });

  return NextResponse.json({ ok: true, id: created.id });
}
