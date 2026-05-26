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

  const [courses, shorts, posts] = await Promise.all([
    prisma.communityModule.findMany({
      orderBy: { order: "asc" },
      include: { sections: { orderBy: { order: "asc" }, include: { _count: { select: { lessons: true } } } } },
    }),
    prisma.communityShort.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.communityFeedPost.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      include: {
        author: { select: { fullName: true } },
        patientAuthor: { select: { fullName: true } },
        _count: { select: { comments: true, reactions: true } },
      },
    }),
  ]);

  return (
    <main>
      <CommunityNav active="comunidad" />
      <CommunityManager
        initialCourses={courses.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          coverUrl: c.coverUrl,
          published: c.published,
          lessonCount: c.sections.reduce((n, s) => n + s._count.lessons, 0),
          sectionCount: c.sections.length,
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
          category: p.category,
          authorName: p.author?.fullName ?? p.patientAuthor?.fullName ?? null,
          isPatient: !!p.patientAuthorId,
          createdAt: p.createdAt.toISOString(),
          comments: p._count.comments,
          reactions: p._count.reactions,
        }))}
      />
    </main>
  );
}
