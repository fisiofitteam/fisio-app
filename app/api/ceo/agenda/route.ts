/**
 * Agenda del día del CEO — ítems rápidos (las "7 normales" del bloque agenda).
 * Las 3 importantes salen automáticamente de CeoTask con dueDate=ese día y se
 * resuelven en el componente cliente, NO en este endpoint.
 *
 * GET    /api/ceo/agenda?date=YYYY-MM-DD (default hoy)
 * POST   /api/ceo/agenda                 → crea ítem (date opcional, default hoy)
 * PATCH  /api/ceo/agenda                 → edita content / completedAt / order
 * DELETE /api/ceo/agenda?id=             → borra
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canUseCeoPersonal, startOfDayUtc } from "@/lib/ceo-personal";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();

  const dateStr = req.nextUrl.searchParams.get("date");
  const date = dateStr ? startOfDayUtc(new Date(dateStr)) : startOfDayUtc();

  const items = await prisma.ceoQuickAgendaItem.findMany({
    where: { professionalId: user.id, date },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ items, date: date.toISOString() });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const content = typeof data?.content === "string" ? data.content.trim() : "";
  if (!content) return NextResponse.json({ error: "content requerido" }, { status: 400 });
  const date = data?.date ? startOfDayUtc(new Date(data.date)) : startOfDayUtc();

  const last = await prisma.ceoQuickAgendaItem.findFirst({
    where: { professionalId: user.id, date },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const created = await prisma.ceoQuickAgendaItem.create({
    data: { professionalId: user.id, date, content, order: (last?.order ?? 0) + 1 },
  });
  return NextResponse.json({ id: created.id });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const id = typeof data?.id === "string" ? data.id : "";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const existing = await prisma.ceoQuickAgendaItem.findUnique({ where: { id }, select: { professionalId: true } });
  if (!existing || existing.professionalId !== user.id) return forbidden();

  const update: any = {};
  if (data.content !== undefined) update.content = String(data.content);
  if (data.completedAt !== undefined) update.completedAt = data.completedAt ? new Date(data.completedAt) : null;
  if (data.order !== undefined && Number.isFinite(Number(data.order))) update.order = Number(data.order);

  await prisma.ceoQuickAgendaItem.update({ where: { id }, data: update });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const existing = await prisma.ceoQuickAgendaItem.findUnique({ where: { id }, select: { professionalId: true } });
  if (!existing || existing.professionalId !== user.id) return forbidden();
  await prisma.ceoQuickAgendaItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
