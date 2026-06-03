import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";

// POST /api/community/lessons/[id]/complete — alterna lección completada (solo pacientes).
// Devuelve { completed }.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.communityLessonProgress.findUnique({
    where: { lessonId_patientId: { lessonId: params.id, patientId: patient.id } },
  });

  if (existing) {
    await prisma.communityLessonProgress.delete({ where: { id: existing.id } });
    return NextResponse.json({ completed: false });
  }
  await prisma.communityLessonProgress.create({
    data: { lessonId: params.id, patientId: patient.id },
  });
  return NextResponse.json({ completed: true });
}
