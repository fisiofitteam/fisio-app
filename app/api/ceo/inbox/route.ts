/**
 * Inbox de captura sin fricción del CEO. Solo texto, sin campos obligatorios.
 *
 * GET    /api/ceo/inbox                 → pendientes (processedAt=null)
 *        /api/ceo/inbox?all=1           → todos los del CEO (limit 200)
 * POST   /api/ceo/inbox  { content }    → crea uno nuevo (devuelve id)
 * PATCH  /api/ceo/inbox  { id, processedAt?, convertedTaskId? }
 * DELETE /api/ceo/inbox?id=             → borra
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canUseCeoPersonal } from "@/lib/ceo-personal";

function forbidden() { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const all = req.nextUrl.searchParams.get("all");
  const where: any = { professionalId: user.id };
  if (!all) where.processedAt = null;
  const items = await prisma.ceoInboxItem.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const content = typeof data?.content === "string" ? data.content.trim() : "";
  if (!content) return NextResponse.json({ error: "content requerido" }, { status: 400 });
  const created = await prisma.ceoInboxItem.create({
    data: { professionalId: user.id, content },
  });
  return NextResponse.json({ id: created.id, createdAt: created.createdAt });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const id = typeof data?.id === "string" ? data.id : "";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const existing = await prisma.ceoInboxItem.findUnique({ where: { id } });
  if (!existing || existing.professionalId !== user.id) return forbidden();

  const update: any = {};
  if (data.processedAt !== undefined) update.processedAt = data.processedAt ? new Date(data.processedAt) : null;
  if (data.convertedTaskId !== undefined) update.convertedTaskId = data.convertedTaskId ? String(data.convertedTaskId) : null;
  if (data.content !== undefined) update.content = String(data.content);

  await prisma.ceoInboxItem.update({ where: { id }, data: update });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const existing = await prisma.ceoInboxItem.findUnique({ where: { id } });
  if (!existing || existing.professionalId !== user.id) return forbidden();
  await prisma.ceoInboxItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
