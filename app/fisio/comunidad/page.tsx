import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { CommunityNav } from "@/components/CommunityNav";
import { CommunityManager } from "@/components/CommunityManager";

export const dynamic = "force-dynamic";

export default async function ComunidadPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  const canManage = user.role === "ceo" || user.role === "head_success" || user.role === "fisio";
  if (!canManage) redirect("/fisio");

  const [modules, shorts, posts] = await Promise.all([
    prisma.communityModule.findMany({
      orderBy: { order: "asc" },
      include: { lessons: { orderBy: { order: "asc" } } },
    }),
    prisma.communityShort.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.communityFeedPost.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      include: {
        author: { select: { fullName: true } },
        _count: { select: { comments: true, reactions: true } },
      },
    }),
  ]);

  return (
    <main>
      <CommunityNav active="comunidad" />
      <CommunityManager
        initialModules={modules.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description,
          coverUrl: m.coverUrl,
          published: m.published,
          lessons: m.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            description: l.description,
            videoUrl: l.videoUrl,
          })),
        }))}
        initialShorts={shorts.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          videoUrl: s.videoUrl,
          published: s.published,
        }))}
        initialPosts={posts.map((p) => ({
          id: p.id,
          title: p.title,
          body: p.body,
          imageUrl: p.imageUrl,
          pinned: p.pinned,
          published: p.published,
          authorName: p.author?.fullName ?? null,
          createdAt: p.createdAt.toISOString(),
          comments: p._count.comments,
          reactions: p._count.reactions,
        }))}
      />
    </main>
  );
}
