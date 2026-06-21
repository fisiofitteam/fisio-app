import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canUseCeoPersonal } from "@/lib/ceo-personal";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const tags = await prisma.ceoTaskTag.findMany({
    where: { professionalId: user.id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ tags });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  const color = typeof data?.color === "string" ? data.color.trim() : "#A3A3A3";
  if (!name) return NextResponse.json({ error: "Nombre obligatorio" }, { status: 400 });

  const last = await prisma.ceoTaskTag.findFirst({
    where: { professionalId: user.id },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const created = await prisma.ceoTaskTag.create({
    data: { professionalId: user.id, name, color, order: (last?.order ?? 0) + 1 },
  });
  return NextResponse.json({ id: created.id });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const id = typeof data?.id === "string" ? data.id : "";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  // Solo el dueño puede editar
  const existing = await prisma.ceoTaskTag.findUnique({ where: { id }, select: { professionalId: true } });
  if (!existing || existing.professionalId !== user.id) return forbidden();

  const update: any = {};
  if (data.name !== undefined) update.name = String(data.name).trim();
  if (data.color !== undefined) update.color = String(data.color);
  if (data.order !== undefined && Number.isFinite(Number(data.order))) update.order = Number(data.order);
  await prisma.ceoTaskTag.update({ where: { id }, data: update });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const existing = await prisma.ceoTaskTag.findUnique({ where: { id }, select: { professionalId: true } });
  if (!existing || existing.professionalId !== user.id) return forbidden();
  await prisma.ceoTaskTag.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
