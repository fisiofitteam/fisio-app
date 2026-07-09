/**
 * GET /api/story-maker/library-images
 *
 * Devuelve las imágenes ya alojadas por el equipo en la app, útiles como
 * fondos de story: portadas de módulos de comunidad + imágenes de posts
 * publicados. Todas están en el CDN (@vercel/blob o URL pública) y ya se
 * han visto en la app, así que se pueden reusar sin miedo.
 *
 * Auth: staff con acceso a Contenido.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "setter") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [modules, posts] = await Promise.all([
    prisma.communityModule.findMany({
      where: { coverUrl: { not: null }, published: true },
      select: { id: true, title: true, coverUrl: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    prisma.communityFeedPost.findMany({
      where: { imageUrl: { not: null }, published: true },
      select: { id: true, title: true, imageUrl: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
  ]);

  const items = [
    ...modules.map((m) => ({
      id: `mod-${m.id}`,
      url: m.coverUrl!,
      label: m.title,
      source: "Curso" as const,
      date: m.updatedAt.toISOString(),
    })),
    ...posts.map((p) => ({
      id: `post-${p.id}`,
      url: p.imageUrl!,
      label: p.title ?? "Post",
      source: "Post" as const,
      date: p.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({ ok: true, items });
}
