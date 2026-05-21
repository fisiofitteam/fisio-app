import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const d = await req.json();
  if (!d.date || !d.title) return NextResponse.json({ error: "date y title requeridos" }, { status: 400 });

  // Normalizamos la fecha a 00:00 UTC para evitar duplicados por hora
  const dt = new Date(d.date);
  dt.setUTCHours(0, 0, 0, 0);

  const ev = await prisma.calendarEvent.create({
    data: {
      date: dt,
      title: d.title,
      notes: d.notes || null,
      color: d.color || "neutral",
    },
  });
  return NextResponse.json(ev);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, ...rest } = await req.json();
  const update: any = {};
  if (rest.title !== undefined) update.title = rest.title;
  if (rest.notes !== undefined) update.notes = rest.notes || null;
  if (rest.color !== undefined) update.color = rest.color || "neutral";
  if (rest.date !== undefined) {
    const dt = new Date(rest.date);
    dt.setUTCHours(0, 0, 0, 0);
    update.date = dt;
  }
  const ev = await prisma.calendarEvent.update({ where: { id }, data: update });
  return NextResponse.json(ev);
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.calendarEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
