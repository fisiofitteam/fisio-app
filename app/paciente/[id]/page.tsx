import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { PatientHomeDark } from "@/components/PatientHomeDark";
import { calculateAdherence } from "@/lib/adherence";

export default async function PatientHome({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: { appliedLevel: { include: { profile: true } } },
  });
  if (!patient) notFound();

  const adherence = await calculateAdherence(patient.id);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const todaySessions = await prisma.programSession.findMany({
    where: {
      assignment: { patientId: patient.id, isActive: true },
      scheduledDate: { gte: today, lt: tomorrow },
    },
    include: { assignment: { include: { program: true } } },
    orderBy: { scheduledDate: "asc" },
  });

  let nextSession = null;
  if (todaySessions.length === 0) {
    nextSession = await prisma.programSession.findFirst({
      where: {
        assignment: { patientId: patient.id, isActive: true },
        scheduledDate: { gte: tomorrow },
      },
      include: { assignment: { include: { program: true } } },
      orderBy: { scheduledDate: "asc" },
    });
  }

  return (
    <PatientHomeDark
      patient={{
        id: patient.id,
        firstName: patient.fullName.split(" ")[0],
        programType: patient.programType,
        difficulty: patient.difficulty,
        appliedLevelName: patient.appliedLevel
          ? `${patient.appliedLevel.profile.name} · ${patient.appliedLevel.name}`
          : null,
      }}
      todaySessions={todaySessions.map((s) => ({
        id: s.id,
        programName: s.assignment.program.name,
        completed: s.completedAt !== null,
        tasksCount: (JSON.parse(s.tasksSnapshot) as any[]).length,
      }))}
      nextSession={
        nextSession
          ? {
              id: nextSession.id,
              date: nextSession.scheduledDate.toISOString(),
              programName: nextSession.assignment.program.name,
              tasksCount: (JSON.parse(nextSession.tasksSnapshot) as any[]).length,
            }
          : null
      }
      adherence={adherence.total > 0 ? {
        completed: adherence.completed,
        total: adherence.total,
        percentage: Math.round((adherence.completed / adherence.total) * 100),
      } : null}
    />
  );
}
