/**
 * POST /api/admin/clean-invalid-shifts
 *
 * Elimina franjas inválidas (start >= end) tanto de DefaultClosingShift
 * como de ClosingShift. Solo CEO.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

export async function POST() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const defaults = await prisma.defaultClosingShift.findMany();
  const ws = await prisma.closingShift.findMany();

  const invalidDefaults = defaults.filter((s) => timeToMinutes(s.endTime) <= timeToMinutes(s.startTime));
  const invalidShifts = ws.filter((s) => timeToMinutes(s.endTime) <= timeToMinutes(s.startTime));

  for (const d of invalidDefaults) {
    await prisma.defaultClosingShift.delete({ where: { id: d.id } });
  }
  for (const s of invalidShifts) {
    await prisma.closingShift.delete({ where: { id: s.id } });
  }

  return NextResponse.json({
    ok: true,
    removed: {
      defaults: invalidDefaults.map((d) => `${d.startTime}-${d.endTime} dow=${d.dayOfWeek}`),
      closingShifts: invalidShifts.map((s) => `${s.startTime}-${s.endTime} dow=${s.dayOfWeek}`),
    },
  });
}
