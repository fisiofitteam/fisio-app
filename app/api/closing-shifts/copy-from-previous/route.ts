import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { weekStartOf } from "@/lib/scheduleResolver";

/**
 * POST /api/closing-shifts/copy-from-previous
 * Body: { weekStart }
 *
 * Copia las franjas de la semana anterior a la semana indicada.
 * Si la semana destino ya tiene franjas, no hace nada (devuelve error 409).
 */
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!["ceo", "closer", "setter"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { weekStart } = await req.json();
  if (!weekStart) return NextResponse.json({ error: "weekStart required" }, { status: 400 });

  const targetWeek = weekStartOf(new Date(weekStart));
  const previousWeek = new Date(targetWeek);
  previousWeek.setDate(previousWeek.getDate() - 7);

  // Si la semana destino ya tiene franjas, no sobreescribimos
  const existing = await prisma.closingShift.count({
    where: { weekStartDate: targetWeek },
  });
  if (existing > 0) {
    return NextResponse.json(
      { error: "Esta semana ya tiene franjas. Bórralas primero si quieres copiar de la anterior." },
      { status: 409 }
    );
  }

  const previousShifts = await prisma.closingShift.findMany({
    where: { weekStartDate: previousWeek },
  });

  if (previousShifts.length === 0) {
    return NextResponse.json(
      { error: "La semana anterior no tiene franjas configuradas." },
      { status: 404 }
    );
  }

  await prisma.closingShift.createMany({
    data: previousShifts.map((s) => ({
      weekStartDate: targetWeek,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      closerId: s.closerId,
      notes: s.notes,
    })),
  });

  return NextResponse.json({ ok: true, copied: previousShifts.length });
}
