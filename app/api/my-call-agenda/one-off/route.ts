/**
 * Franjas horarias PUNTUALES del fisio para una fecha concreta. Se suman a
 * la plantilla semanal en `computeFreeSlots` — sirven para "esta semana
 * también estoy libre el martes por la tarde" sin tocar la plantilla base.
 *
 * Para BLOQUEAR una franja habitual el fisio pone un evento en su Google
 * Calendar y FreeBusy lo tumba solo; no hay que crear override negativo.
 *
 * POST   /api/my-call-agenda/one-off — { date: "YYYY-MM-DD", startTime, endTime }
 * DELETE /api/my-call-agenda/one-off?id=...
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function requireStaff() {
  const user = await getActiveProfessional();
  if (!user) return { error: "Unauthorized" as const, status: 401 };
  if (!(user.role === "fisio" || user.role === "head_success" || user.role === "ceo")) {
    return { error: "Forbidden" as const, status: 403 };
  }
  return { user };
}

export async function POST(req: NextRequest) {
  const g = await requireStaff();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const b = await req.json().catch(() => ({}));

  const dateStr = String(b?.date ?? "");
  if (!isValidDate(dateStr)) {
    return NextResponse.json({ error: "date debe ser YYYY-MM-DD" }, { status: 400 });
  }
  const startTime = String(b?.startTime ?? "");
  const endTime = String(b?.endTime ?? "");
  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return NextResponse.json({ error: "Horas inválidas (formato HH:mm)" }, { status: 400 });
  }
  if (startTime >= endTime) {
    return NextResponse.json({ error: "La hora de fin debe ser posterior a la de inicio" }, { status: 400 });
  }

  // Guardamos la fecha como UTC-midnight del día "YYYY-MM-DD". El helper de
  // slots reinterpreta la fecha en zona Madrid al comparar, así que esto es
  // seguro para todas las semanas del año (incluidos cambios de horario).
  const date = new Date(`${dateStr}T00:00:00Z`);
  const one = await (prisma as any).professionalCallAvailabilityOneOff.create({
    data: {
      professionalId: g.user.id,
      date,
      startTime,
      endTime,
    },
  });
  return NextResponse.json({ oneOff: one });
}

export async function DELETE(req: NextRequest) {
  const g = await requireStaff();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const row = await (prisma as any).professionalCallAvailabilityOneOff.findUnique({ where: { id } });
  if (!row || row.professionalId !== g.user.id) {
    return NextResponse.json({ error: "No encontrada o no es tuya" }, { status: 404 });
  }

  await (prisma as any).professionalCallAvailabilityOneOff.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
