import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { FEED_CATEGORY_VALUES } from "@/lib/community-feed";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

const FEED_INCLUDE = {
  author: { select: { fullName: true } },
  patientAuthor: { select: { fullName: true } },
  _count: { select: { comments: true, reactions: true } },
} as const;

// GET /api/community/feed — posts del muro con autor y conteos.
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const posts = await prisma.communityFeedPost.findMany({
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    include: FEED_INCLUDE,
  });
  return NextResponse.json(posts);
}

// POST /api/community/feed — crea un post. body: { title?, body, category?, imageUrl?, pinned? }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const body = typeof b?.body === "string" ? b.body.trim() : "";
  if (!body) return NextResponse.json({ error: "El texto del post es obligatorio." }, { status: 400 });
  const category = FEED_CATEGORY_VALUES.includes(b?.category) ? b.category : "general";

  const created = await prisma.communityFeedPost.create({
    data: {
      authorId: user.id,
      category,
      title: b?.title?.trim() || null,
      body,
      imageUrl: b?.imageUrl?.trim() || null,
      pinned: b?.pinned === true,
    },
    include: FEED_INCLUDE,
  });
  return NextResponse.json(created);
}
