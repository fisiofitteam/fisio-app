import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

// GET /api/community/modules — módulos con sus lecciones (orden).
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const modules = await prisma.communityModule.findMany({
    orderBy: { order: "asc" },
    include: { sections: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } } },
  });
  return NextResponse.json(modules);
}

// POST /api/community/modules — crea un módulo. body: { title, description?, coverUrl? }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  if (!title) return NextResponse.json({ error: "El título es obligatorio." }, { status: 400 });

  const last = await prisma.communityModule.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const created = await prisma.communityModule.create({
    data: {
      title,
      description: b?.description?.trim() || null,
      coverUrl: b?.coverUrl?.trim() || null,
      order: (last?.order ?? -1) + 1,
      createdById: user.id,
    },
    include: { sections: { include: { lessons: true } } },
  });
  return NextResponse.json(created);
}
