/**
 * GET /api/community/unread
 *
 * Devuelve el número de posts + comentarios en la comunidad creados desde
 * la última vez que el profesional entró en /fisio/comunidad. Usado por el
 * badge del sidebar. Excluye lo que ha escrito él mismo.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";

function canSee(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio" || role === "setter" || role === "closer";
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canSee(user.role)) return NextResponse.json({ count: 0 });

  // El campo se añadió en schema.production.prisma; en dev con sqlite puede
  // no existir todavía. Fallback: si viene null usamos la fecha de login.
  const pro = await prisma.professional.findUnique({
    where: { id: user.id },
    select: { communityLastSeenAt: true, lastLoginAt: true, createdAt: true } as any,
  });
  const since = (pro as any)?.communityLastSeenAt ?? pro?.lastLoginAt ?? pro?.createdAt ?? new Date(0);

  const [newPosts, newComments] = await Promise.all([
    prisma.communityFeedPost.count({
      where: {
        createdAt: { gt: since },
        published: true,
        NOT: { authorId: user.id },
      },
    }),
    prisma.communityComment.count({
      where: {
        createdAt: { gt: since },
        NOT: { professionalId: user.id },
      },
    }),
  ]);

  return NextResponse.json({ count: newPosts + newComments, posts: newPosts, comments: newComments });
}
