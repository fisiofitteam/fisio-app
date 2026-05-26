import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

// GET /api/community/shorts — lista de vídeos cortos (más recientes primero).
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const shorts = await prisma.communityShort.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(shorts);
}

// POST /api/community/shorts — body: { title, videoUrl, description? }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  const videoUrl = typeof b?.videoUrl === "string" ? b.videoUrl.trim() : "";
  if (!title || !videoUrl) return NextResponse.json({ error: "Título y vídeo son obligatorios." }, { status: 400 });

  const created = await prisma.communityShort.create({
    data: {
      title,
      videoUrl,
      description: b?.description?.trim() || null,
      createdById: user.id,
    },
  });
  return NextResponse.json(created);
}
