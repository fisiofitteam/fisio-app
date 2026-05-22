import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { timeToMinutes, weekStartOf } from "@/lib/scheduleResolver";

/**
 * Permisos:
 *  - VER y EDITAR: ceo, closer, setter
 *  - NO acceden: head_success, fisio
 */
function canManage(role: string): boolean {
  return role === "ceo" || role === "closer" || role === "setter";
}

// ============================================================================
// GET /api/closing-shifts?weekStart=ISO
// Lista las franjas de una semana. Si no se pasa weekStart, devuelve la actual.
// ============================================================================
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canManage(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const weekStartParam = req.nextUrl.searchParams.get("weekStart");
  const weekStart = weekStartParam
    ? weekStartOf(new Date(weekStartParam))
    : weekStartOf(new Date());

  const shifts = await prisma.closingShift.findMany({
    where: { weekStartDate: weekStart },
    include: {
      closer: { select: { id: true, fullName: true, role: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  return NextResponse.json({
    weekStart: weekStart.toISOString(),
    shifts: shifts.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      closerId: s.closerId,
      closerName: s.closer.fullName,
      closerRole: s.closer.role,
      notes: s.notes,
    })),
  });
}

// ============================================================================
// POST /api/closing-shifts
// Body: { weekStart, dayOfWeek, startTime, endTime, closerId, notes? }
// Crea una franja nueva (valida que no solape con otra del mismo día/semana).
// ============================================================================
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canManage(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { weekStart, dayOfWeek, startTime, endTime, closerId, notes } = body;

  if (!weekStart || !dayOfWeek || !startTime || !endTime || !closerId) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }
  if (dayOfWeek < 1 || dayOfWeek > 7) {
    return NextResponse.json({ error: "dayOfWeek debe ser 1-7" }, { status: 400 });
  }

  // Validar formato HH:MM
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return NextResponse.json({ error: "Hora en formato inválido (usa HH:MM)" }, { status: 400 });
  }
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  if (endMin <= startMin) {
    return NextResponse.json(
      { error: "La hora de fin debe ser posterior a la de inicio" },
      { status: 400 }
    );
  }

  // Validar que el closer existe y es un rol válido
  const closer = await prisma.professional.findUnique({ where: { id: closerId } });
  if (!closer) {
    return NextResponse.json({ error: "Closer no encontrado" }, { status: 400 });
  }
  if (!["ceo", "closer", "setter"].includes(closer.role)) {
    return NextResponse.json(
      { error: "Solo CEO, Closer o Setter pueden cubrir franjas" },
      { status: 400 }
    );
  }

  const ws = weekStartOf(new Date(weekStart));

  // Validar solapamiento con otras franjas del mismo día/semana (de cualquier closer)
  const existing = await prisma.closingShift.findMany({
    where: { weekStartDate: ws, dayOfWeek },
  });
  for (const s of existing) {
    const sStart = timeToMinutes(s.startTime);
    const sEnd = timeToMinutes(s.endTime);
    // Solapan si A.start < B.end AND A.end > B.start
    if (startMin < sEnd && endMin > sStart) {
      return NextResponse.json(
        {
          error: `Se solapa con franja existente de ${s.startTime} a ${s.endTime}. Ajusta el horario o cancela la otra primero.`,
        },
        { status: 409 }
      );
    }
  }

  const shift = await prisma.closingShift.create({
    data: {
      weekStartDate: ws,
      dayOfWeek,
      startTime,
      endTime,
      closerId,
      notes: notes?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true, id: shift.id });
}

// ============================================================================
// PATCH /api/closing-shifts
// Body: { id, startTime?, endTime?, closerId?, notes? }
// Edita una franja. Revalida solapamiento.
// ============================================================================
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canManage(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, startTime, endTime, closerId, notes } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const current = await prisma.closingShift.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newStart = startTime || current.startTime;
  const newEnd = endTime || current.endTime;
  if (!/^\d{2}:\d{2}$/.test(newStart) || !/^\d{2}:\d{2}$/.test(newEnd)) {
    return NextResponse.json({ error: "Hora en formato inválido" }, { status: 400 });
  }
  const sMin = timeToMinutes(newStart);
  const eMin = timeToMinutes(newEnd);
  if (eMin <= sMin) {
    return NextResponse.json(
      { error: "La hora de fin debe ser posterior a la de inicio" },
      { status: 400 }
    );
  }

  // Validar solapamiento con otras franjas (excluyendo la propia)
  const others = await prisma.closingShift.findMany({
    where: {
      weekStartDate: current.weekStartDate,
      dayOfWeek: current.dayOfWeek,
      NOT: { id: current.id },
    },
  });
  for (const s of others) {
    const oStart = timeToMinutes(s.startTime);
    const oEnd = timeToMinutes(s.endTime);
    if (sMin < oEnd && eMin > oStart) {
      return NextResponse.json(
        { error: `Se solapa con franja existente de ${s.startTime} a ${s.endTime}` },
        { status: 409 }
      );
    }
  }

  if (closerId) {
    const closer = await prisma.professional.findUnique({ where: { id: closerId } });
    if (!closer || !["ceo", "closer", "setter"].includes(closer.role)) {
      return NextResponse.json({ error: "Closer no válido" }, { status: 400 });
    }
  }

  await prisma.closingShift.update({
    where: { id },
    data: {
      ...(startTime !== undefined && { startTime: newStart }),
      ...(endTime !== undefined && { endTime: newEnd }),
      ...(closerId !== undefined && { closerId }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
    },
  });

  return NextResponse.json({ ok: true });
}

// ============================================================================
// DELETE /api/closing-shifts?id=xxx
// ============================================================================
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canManage(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.closingShift.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
