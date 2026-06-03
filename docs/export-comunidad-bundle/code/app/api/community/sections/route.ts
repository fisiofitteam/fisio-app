import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

// POST /api/community/sections — crea una sección dentro de un curso.
// body: { moduleId, title }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const moduleId = typeof b?.moduleId === "string" ? b.moduleId : "";
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  if (!moduleId || !title) return NextResponse.json({ error: "Curso y título son obligatorios." }, { status: 400 });

  const last = await prisma.communitySection.findFirst({ where: { moduleId }, orderBy: { order: "desc" }, select: { order: true } });
  const created = await prisma.communitySection.create({
    data: { moduleId, title, order: (last?.order ?? -1) + 1 },
    include: { lessons: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(created);
}
