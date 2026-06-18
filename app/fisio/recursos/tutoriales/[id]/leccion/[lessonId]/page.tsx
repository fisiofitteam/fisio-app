import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { TutorialsLessonDetail } from "@/components/TutorialsLessonDetail";
import { canManageTraining, moduleVisibleFor } from "@/lib/training";
import { type ResourceRole } from "@/lib/resource-roles";

export const dynamic = "force-dynamic";

export default async function TutorialLessonPage({ params }: { params: { id: string; lessonId: string } }) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  const userRole = user.role as ResourceRole;
  const canManage = canManageTraining(user.role);

  const lesson = await prisma.trainingLesson.findUnique({
    where: { id: params.lessonId },
    include: {
      section: { include: { module: { select: { id: true, title: true, targetRoles: true, published: true } } } },
      attachments: { orderBy: { order: "asc" } },
    },
  });
  if (!lesson) notFound();
  if (lesson.section.module.id !== params.id) notFound();
  if (!moduleVisibleFor(lesson.section.module.targetRoles, lesson.section.module.published, userRole, canManage)) notFound();

  return (
    <div>
      <Link href={`/fisio/recursos/tutoriales/${params.id}`} className="text-xs text-neutral-500 hover:text-neutral-900">
        ← {lesson.section.module.title}
      </Link>
      <TutorialsLessonDetail
        canManage={canManage}
        lesson={{
          id: lesson.id,
          title: lesson.title,
          description: lesson.description ?? "",
          videoUrl: lesson.videoUrl,
          sectionTitle: lesson.section.title,
        }}
        attachments={lesson.attachments.map((a) => ({
          id: a.id,
          kind: a.kind as "pdf" | "link" | "image",
          url: a.url,
          name: a.name,
        }))}
      />
    </div>
  );
}
