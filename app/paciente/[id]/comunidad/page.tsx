import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientCommunity } from "@/components/PatientCommunity";

export const dynamic = "force-dynamic";

export default async function PatientCommunityPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({ where: { id: params.id }, select: { id: true, fullName: true } });
  if (!patient) notFound();

  const [posts, courses, myReactions, myProgress] = await Promise.all([
    prisma.communityFeedPost.findMany({
      where: { published: true },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      include: {
        author: { select: { fullName: true } },
        patientAuthor: { select: { fullName: true } },
        _count: { select: { comments: true, reactions: true } },
      },
    }),
    prisma.communityModule.findMany({
      where: { published: true },
      orderBy: { order: "asc" },
      include: { sections: { include: { lessons: { select: { id: true } } } } },
    }),
    prisma.communityReaction.findMany({ where: { patientId: patient.id }, select: { postId: true } }),
    prisma.communityLessonProgress.findMany({ where: { patientId: patient.id }, select: { lessonId: true } }),
  ]);

  const likedSet = new Set(myReactions.map((r) => r.postId));
  const doneSet = new Set(myProgress.map((p) => p.lessonId));

  return (
    <PatientCommunity
      patientId={patient.id}
      myName={patient.fullName}
      initialPosts={posts.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        imageUrl: p.imageUrl,
        category: p.category,
        pinned: p.pinned,
        authorName: p.author?.fullName ?? p.patientAuthor?.fullName ?? "Equipo",
        isPatient: !!p.patientAuthorId,
        createdAt: p.createdAt.toISOString(),
        comments: p._count.comments,
        reactions: p._count.reactions,
        likedByMe: likedSet.has(p.id),
      }))}
      courses={courses.map((c) => {
        const lessonIds = c.sections.flatMap((s) => s.lessons.map((l) => l.id));
        const done = lessonIds.filter((id) => doneSet.has(id)).length;
        return {
          id: c.id,
          title: c.title,
          description: c.description,
          coverUrl: c.coverUrl,
          lessonCount: lessonIds.length,
          doneCount: done,
        };
      })}
    />
  );
}
