import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { CourseEditor } from "@/components/CourseEditor";

export const dynamic = "force-dynamic";

export default async function CursoEditorPage({ params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  const canManage = user.role === "ceo" || user.role === "head_success" || user.role === "fisio";
  if (!canManage) redirect("/fisio");

  const course = await prisma.communityModule.findUnique({
    where: { id: params.id },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!course) notFound();

  return (
    <main>
      <CourseEditor
        course={{
          id: course.id,
          title: course.title,
          description: course.description,
          coverUrl: course.coverUrl,
          published: course.published,
          sections: course.sections.map((s) => ({
            id: s.id,
            title: s.title,
            lessons: s.lessons.map((l) => ({
              id: l.id,
              title: l.title,
              description: l.description,
              videoUrl: l.videoUrl,
            })),
          })),
        }}
      />
    </main>
  );
}
