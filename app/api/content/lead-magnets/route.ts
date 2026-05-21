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
  const lm = await prisma.leadMagnet.create({
    data: {
      name: d.name,
      keyword: d.keyword || null,
      description: d.description || null,
      url: d.url || null,
      active: d.active ?? true,
    },
  });
  return NextResponse.json(lm);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, ...rest } = await req.json();
  const update: any = {};
  if (rest.name !== undefined) update.name = rest.name;
  if (rest.keyword !== undefined) update.keyword = rest.keyword || null;
  if (rest.description !== undefined) update.description = rest.description || null;
  if (rest.url !== undefined) update.url = rest.url || null;
  if (rest.active !== undefined) update.active = !!rest.active;
  const lm = await prisma.leadMagnet.update({ where: { id }, data: update });
  return NextResponse.json(lm);
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.leadMagnet.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
