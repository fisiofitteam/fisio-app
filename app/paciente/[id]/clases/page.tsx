import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientClassroom } from "@/components/PatientClassroom";

export const dynamic = "force-dynamic";

export default async function PatientClassesPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, programType: true },
  });
  if (!patient) notFound();

  const navVariant =
    patient.programType === "PREVENTION" ? "prevention" : patient.programType === "ADVANCE" ? "advance" : "default";

  const [modules, myProgress] = await Promise.all([
    prisma.communityModule.findMany({
      where: { published: true },
      orderBy: { order: "asc" },
      include: { sections: { include: { lessons: { select: { id: true } } } } },
    }),
    prisma.communityLessonProgress.findMany({
      where: { patientId: patient.id },
      select: { lessonId: true },
    }),
  ]);

  const doneSet = new Set(myProgress.map((p) => p.lessonId));
  const courses = modules.map((m) => {
    const lessonIds = m.sections.flatMap((s) => s.lessons.map((l) => l.id));
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      coverUrl: m.coverUrl,
      lessonCount: lessonIds.length,
      doneCount: lessonIds.filter((id) => doneSet.has(id)).length,
    };
  });

  return <PatientClassroom patientId={patient.id} courses={courses} navVariant={navVariant} />;
}
