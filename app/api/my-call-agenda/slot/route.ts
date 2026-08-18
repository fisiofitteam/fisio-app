/**
 * POST   /api/my-call-agenda/slot — añade una franja horaria
 *   Body: { dayOfWeek: 1-7; startTime: "HH:mm"; endTime: "HH:mm" }
 * DELETE /api/my-call-agenda/slot?id=... — elimina una franja del fisio logueado
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
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

  const dayOfWeek = Number(b?.dayOfWeek);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
    return NextResponse.json({ error: "dayOfWeek debe ser 1-7" }, { status: 400 });
  }
  const startTime = String(b?.startTime ?? "");
  const endTime = String(b?.endTime ?? "");
  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return NextResponse.json({ error: "Horas inválidas (formato HH:mm)" }, { status: 400 });
  }
  if (startTime >= endTime) {
    return NextResponse.json({ error: "La hora de fin debe ser posterior a la de inicio" }, { status: 400 });
  }

  const slot = await (prisma as any).professionalCallAvailability.create({
    data: {
      professionalId: g.user.id,
      dayOfWeek,
      startTime,
      endTime,
    },
  });
  return NextResponse.json({ slot });
}

export async function DELETE(req: NextRequest) {
  const g = await requireStaff();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const slot = await (prisma as any).professionalCallAvailability.findUnique({ where: { id } });
  if (!slot || slot.professionalId !== g.user.id) {
    return NextResponse.json({ error: "No encontrada o no es tuya" }, { status: 404 });
  }

  await (prisma as any).professionalCallAvailability.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
