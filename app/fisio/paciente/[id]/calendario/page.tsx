import { prisma } from "@/lib/prisma";
import { CalendarMonth } from "@/components/CalendarMonth";

export default async function PatientCalendarTab({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { y?: string; m?: string };
}) {
  const now = new Date();
  const year = searchParams.y ? Number(searchParams.y) : now.getFullYear();
  const month = searchParams.m ? Number(searchParams.m) : now.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0, 23, 59, 59);

  const sessions = await prisma.programSession.findMany({
    where: {
      assignment: { patientId: params.id },
      scheduledDate: { gte: firstDay, lte: lastDay },
    },
    include: { assignment: { include: { program: true } } },
    orderBy: { scheduledDate: "asc" },
  });

  const activeAssignments = await prisma.programAssignment.findMany({
    where: {
      patientId: params.id,
      isActive: true,
      program: { isStandalone: false },
    },
    include: { program: true, _count: { select: { sessions: true } } },
    orderBy: { startDate: "desc" },
  });

  const allPrograms = await prisma.program.findMany({
    where: { isStandalone: false },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return (
    <CalendarMonth
      patientId={params.id}
      year={year}
      month={month}
      sessions={sessions.map((s) => ({
        id: s.id,
        scheduledDate: s.scheduledDate.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
        weekNumber: s.weekNumber,
        programName: s.assignment.program.name,
        programType: s.assignment.program.type,
        tasksSnapshot: s.tasksSnapshot,
        responses: s.responses,
        formReviewedAt: s.formReviewedAt?.toISOString() ?? null,
        isStandalone: s.assignment.program.isStandalone,
      }))}
      activeAssignments={activeAssignments.map((a) => ({
        id: a.id,
        programName: a.program.name,
        programType: a.program.type,
        programLevel: a.program.level,
        startDate: a.startDate.toISOString(),
        weeksCount: a.weeksCount,
        sessionCount: a._count.sessions,
      }))}
      allPrograms={allPrograms.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        level: p.level,
        weeksCount: p.weeksCount,
      }))}
    />
  );
}
