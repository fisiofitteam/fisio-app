import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

// POST /api/community/lessons — crea una lección dentro de una sección.
// body: { sectionId, title, videoUrl, description? }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const sectionId = typeof b?.sectionId === "string" ? b.sectionId : "";
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  const videoUrl = typeof b?.videoUrl === "string" ? b.videoUrl.trim() : "";
  if (!sectionId || !title || !videoUrl) {
    return NextResponse.json({ error: "Sección, título y vídeo son obligatorios." }, { status: 400 });
  }

  const last = await prisma.communityLesson.findFirst({ where: { sectionId }, orderBy: { order: "desc" }, select: { order: true } });
  const created = await prisma.communityLesson.create({
    data: {
      sectionId,
      title,
      videoUrl,
      description: b?.description?.trim() || null,
      order: (last?.order ?? -1) + 1,
    },
  });
  return NextResponse.json(created);
}
