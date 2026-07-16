import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { FEED_CATEGORY_VALUES } from "@/lib/community-feed";
import { sanitizeRichText } from "@/lib/rich-text";

function canManage(role: string): boolean {
  // Todos los profesionales del equipo pueden moderar (incluye setter/closer).
  return role === "ceo" || role === "head_success" || role === "fisio" || role === "setter" || role === "closer";
}

// PATCH /api/community/feed/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const data: any = {};
  if ("title" in b) data.title = b.title?.trim() || null;
  if (typeof b?.body === "string") data.body = sanitizeRichText(b.body.trim());
  if ("imageUrl" in b) data.imageUrl = b.imageUrl?.trim() || null;
  if (typeof b?.pinned === "boolean") data.pinned = b.pinned;
  if (typeof b?.published === "boolean") data.published = b.published;
  if (FEED_CATEGORY_VALUES.includes(b?.category)) data.category = b.category;

  const updated = await prisma.communityFeedPost.update({
    where: { id: params.id },
    data,
    include: {
      author: { select: { fullName: true } },
      patientAuthor: { select: { fullName: true } },
      _count: { select: { comments: true, reactions: true } },
    },
  });
  return NextResponse.json(updated);
}

// DELETE /api/community/feed/[id] — borra post, comentarios y reacciones (cascade).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.communityFeedPost.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
