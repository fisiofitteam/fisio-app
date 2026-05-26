import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

// PATCH /api/community/modules/[id] — actualiza un módulo.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof b?.title === "string") data.title = b.title.trim();
  if ("description" in b) data.description = b.description?.trim() || null;
  if ("coverUrl" in b) data.coverUrl = b.coverUrl?.trim() || null;
  if (typeof b?.published === "boolean") data.published = b.published;
  if (typeof b?.order === "number") data.order = b.order;

  const updated = await prisma.communityModule.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/community/modules/[id] — borra módulo y sus lecciones (cascade).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.communityModule.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
