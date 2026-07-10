import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { CommunityNav } from "@/components/CommunityNav";
import { CommunityManager } from "@/components/CommunityManager";

export const dynamic = "force-dynamic";

export default async function ComunidadPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  const ALLOWED = ["ceo", "head_success", "fisio", "setter", "closer"];
  if (!ALLOWED.includes(user.role)) redirect("/fisio");
  // Todos los del equipo pueden moderar el muro; sólo los gestores ven la pestaña Clases.
  const canModerate = true;
  const canManageClassroom = user.role === "ceo" || user.role === "head_success" || user.role === "fisio";

  // Marcar la comunidad como vista → resetea el badge del sidebar. Fire-and-forget
  // (no bloquea la carga del feed). El campo comienza como null en el schema y se
  // crea en el primer entra.
  prisma.professional
    .update({ where: { id: user.id }, data: { communityLastSeenAt: new Date() } as any })
    .catch(() => {});

  const [courses, posts, myReactions] = await Promise.all([
    prisma.communityModule.findMany({
      orderBy: { order: "asc" },
      include: { sections: { orderBy: { order: "asc" }, include: { _count: { select: { lessons: true } } } } },
    }),
    prisma.communityFeedPost.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      include: {
        author: { select: { fullName: true, photoUrl: true } },
        patientAuthor: { select: { fullName: true, photoUrl: true } },
        _count: { select: { comments: true, reactions: true } },
      },
    }),
    prisma.communityReaction.findMany({ where: { professionalId: user.id }, select: { postId: true } }),
  ]);
  const likedByMeSet = new Set(myReactions.map((r) => r.postId));

  return (
    <main>
      {canManageClassroom && <CommunityNav active="comunidad" />}
      <CommunityManager
        canManageClassroom={canManageClassroom}
        canModerate={canModerate}
        initialCourses={courses.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          coverUrl: c.coverUrl,
          published: c.published,
          lessonCount: c.sections.reduce((n, s) => n + s._count.lessons, 0),
          sectionCount: c.sections.length,
        }))}
        initialPosts={posts.map((p) => ({
          id: p.id,
          title: p.title,
          body: p.body,
          imageUrl: p.imageUrl,
          videoUrl: p.videoUrl,
          pinned: p.pinned,
          published: p.published,
          category: p.category,
          authorName: p.author?.fullName ?? p.patientAuthor?.fullName ?? null,
          authorPhotoUrl: p.author?.photoUrl ?? p.patientAuthor?.photoUrl ?? null,
          isPatient: !!p.patientAuthorId,
          createdAt: p.createdAt.toISOString(),
          comments: p._count.comments,
          reactions: p._count.reactions,
          likedByMe: likedByMeSet.has(p.id),
        }))}
      />
    </main>
  );
}
