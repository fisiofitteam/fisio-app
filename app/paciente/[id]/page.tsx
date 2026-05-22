import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientHomeDark } from "@/components/PatientHomeDark";
import { PatientHomePaused } from "@/components/PatientHomePaused";
import { PatientHomeRolling } from "@/components/PatientHomeRolling";
import { calculateAdherence } from "@/lib/adherence";
import { getPauseSnapshot, weekStartDate } from "@/lib/program-pauses";

export default async function PatientHome({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: { appliedLevel: { include: { profile: true } } },
  });
  if (!patient) notFound();

  const firstName = patient.fullName.split(" ")[0];

  // --- 1. Si está pausado → vista de pausa con countdown ---
  const pauseSnapshot = await getPauseSnapshot(patient.id);
  if (pauseSnapshot.isPaused && pauseSnapshot.activePause) {
    return (
      <PatientHomePaused
        firstName={firstName}
        endDate={pauseSnapshot.activePause.endDate.toISOString()}
        daysRemaining={pauseSnapshot.activePause.daysRemaining}
        reason={pauseSnapshot.activePause.reason}
      />
    );
  }

  // --- 2. Si es ADVANCE rolling → vista de programa rolling ---
  if (patient.programMode === "rolling" && patient.rollingProgramId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonday = weekStartDate(today);

    // Calcular fecha de fin de suscripción (para avisos de caducidad)
    const subEnd = patient.subscriptionStartDate
      ? (() => {
          const e = new Date(patient.subscriptionStartDate);
          e.setMonth(e.getMonth() + patient.subscriptionPeriodMonths);
          return e;
        })()
      : null;
    const daysToExpire = subEnd ? Math.round((subEnd.getTime() - today.getTime()) / 86400000) : null;

    // Si ya caducó, no le dejamos ver el programa
    if (daysToExpire !== null && daysToExpire < 0) {
      return (
        <PatientHomeRolling
          firstName={firstName}
          patientId={patient.id}
          mode="expired"
          weekStartIso={thisMonday.toISOString()}
        />
      );
    }

    // Buscar la semana del programa que corresponde a esta semana del calendario
    const week = await prisma.rollingWeek.findUnique({
      where: {
        programId_weekStartDate: {
          programId: patient.rollingProgramId,
          weekStartDate: thisMonday,
        },
      },
      include: {
        days: {
          include: { tasks: { orderBy: { order: "asc" } } },
          orderBy: { dayOfWeek: "asc" },
        },
      },
    });

    return (
      <PatientHomeRolling
        firstName={firstName}
        patientId={patient.id}
        mode={week && week.publishedAt ? "ready" : "pending"}
        weekStartIso={thisMonday.toISOString()}
        title={week?.title || null}
        days={week?.days.map((d) => ({
          dayOfWeek: d.dayOfWeek,
          tasks: d.tasks.map((t) => ({
            id: t.id,
            type: t.type,
            title: t.title,
            bodyText: t.bodyText,
            youtubeUrl: t.youtubeUrl,
          })),
        })) || []}
        daysToExpire={daysToExpire}
      />
    );
  }

  // --- 3. Vista normal (programa fijo) ---
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

  // Si hay una pausa programada (futura), avisamos en el dashboard
  const upcomingPause = pauseSnapshot.upcomingPause;

  return (
    <PatientHomeDark
      patient={{
        id: patient.id,
        firstName,
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
      upcomingPause={upcomingPause ? {
        startDate: upcomingPause.startDate.toISOString(),
        endDate: upcomingPause.endDate.toISOString(),
      } : null}
    />
  );
}
