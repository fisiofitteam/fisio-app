import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientCommunity } from "@/components/PatientCommunity";

export const dynamic = "force-dynamic";

export default async function PatientCommunityPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, fullName: true, photoUrl: true, programType: true, communityLastSeenAt: true },
  });
  if (!patient) notFound();

  const navVariant = patient.programType === "PREVENTION" ? "prevention" : "default";

  // Capturamos el timestamp ANTES de resetearlo: se usa para marcar los
  // posts/comentarios creados posteriormente como "NUEVOS" en esta visita.
  // Si es la primera vez, epoch para que todo cuente como nuevo.
  const lastSeenAt = patient.communityLastSeenAt ?? new Date(0);

  // Marca la comunidad como vista (reset del badge de novedades en la home).
  prisma.patient.update({ where: { id: patient.id }, data: { communityLastSeenAt: new Date() } }).catch(() => {});

  // Clases se separaron a /paciente/[id]/clases — aquí solo carga el feed.
  const [posts, myReactions] = await Promise.all([
    prisma.communityFeedPost.findMany({
      where: { published: true },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      include: {
        author: { select: { fullName: true, photoUrl: true } },
        patientAuthor: { select: { fullName: true, photoUrl: true } },
        _count: { select: { comments: true, reactions: true } },
      },
    }),
    prisma.communityReaction.findMany({ where: { patientId: patient.id }, select: { postId: true } }),
  ]);

  const likedSet = new Set(myReactions.map((r) => r.postId));

  return (
    <PatientCommunity
      patientId={patient.id}
      myName={patient.fullName}
      myPhotoUrl={patient.photoUrl}
      navVariant={navVariant}
      lastSeenAt={lastSeenAt.toISOString()}
      initialPosts={posts.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        imageUrl: p.imageUrl,
        videoUrl: p.videoUrl,
        category: p.category,
        pinned: p.pinned,
        authorName: p.author?.fullName ?? p.patientAuthor?.fullName ?? "Equipo",
        authorPhotoUrl: p.author?.photoUrl ?? p.patientAuthor?.photoUrl ?? null,
        isPatient: !!p.patientAuthorId,
        createdAt: p.createdAt.toISOString(),
        comments: p._count.comments,
        reactions: p._count.reactions,
        likedByMe: likedSet.has(p.id),
      }))}
    />
  );
}
