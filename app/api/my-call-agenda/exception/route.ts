/**
 * Excepciones a la plantilla del fisio para una fecha concreta.
 * Sirven para "borrar solo esta semana este chip gris" en la vista Por
 * semana sin tocar la plantilla base.
 *
 * Se identifica por (date, startTime, endTime). El helper computeFreeSlots
 * elimina de la plantilla del día cualquier franja cuyo startTime/endTime
 * coincida con una excepción de esa misma fecha.
 *
 * POST   /api/my-call-agenda/exception — { date: "YYYY-MM-DD", startTime, endTime }
 * DELETE /api/my-call-agenda/exception?id=...
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

  const date = new Date(`${dateStr}T00:00:00Z`);
  const row = await (prisma as any).professionalCallException.create({
    data: {
      professionalId: g.user.id,
      date,
      startTime,
      endTime,
    },
  });
  return NextResponse.json({ exception: row });
}

export async function DELETE(req: NextRequest) {
  const g = await requireStaff();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const row = await (prisma as any).professionalCallException.findUnique({ where: { id } });
  if (!row || row.professionalId !== g.user.id) {
    return NextResponse.json({ error: "No encontrada o no es tuya" }, { status: 404 });
  }

  await (prisma as any).professionalCallException.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
