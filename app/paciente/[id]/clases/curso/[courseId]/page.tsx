import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientCourse } from "@/components/PatientCourse";

export const dynamic = "force-dynamic";

export default async function PatientCoursePage({ params }: { params: { id: string; courseId: string } }) {
  const [course, progress] = await Promise.all([
    prisma.communityModule.findFirst({
      where: { id: params.courseId, published: true },
      include: { sections: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } } },
    }),
    prisma.communityLessonProgress.findMany({ where: { patientId: params.id }, select: { lessonId: true } }),
  ]);
  if (!course) notFound();

  const doneSet = new Set(progress.map((p) => p.lessonId));

  return (
    <PatientCourse
      patientId={params.id}
      course={{
        id: course.id,
        title: course.title,
        description: course.description,
        sections: course.sections.map((s) => ({
          id: s.id,
          title: s.title,
          lessons: s.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            description: l.description,
            videoUrl: l.videoUrl,
            done: doneSet.has(l.id),
          })),
        })),
      }}
    />
  );
}
