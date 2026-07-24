import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientSidebar } from "@/components/PatientSidebar";
import { ProgressRing } from "@/components/ProgressRing";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { PatientPill } from "@/components/PatientPills";
import { GoToPatient } from "@/components/GoToPatient";
import { LoadReviewIntervalSelector } from "@/components/LoadReviewIntervalSelector";
import { PatientNotesButton } from "@/components/PatientNotesButton";
import { PatientAccessLinkButton } from "@/components/PatientAccessLinkButton";
import { SendLoginCodeButton } from "@/components/SendLoginCodeButton";
import { MarkAsLegacyButton } from "@/components/MarkAsLegacyButton";
import { PatientAgendaButton } from "@/components/PatientAgendaButton";
import { PatientAlertsCard } from "@/components/PatientAlertsCard";
import { MetricAlertsPatientButton } from "@/components/MetricAlertsPatientButton";
import { PatientTestModeToggle } from "@/components/PatientTestModeToggle";
import { calculateAdherence } from "@/lib/adherence";
import { getActiveProfessional } from "@/lib/session";
import { parseTargetRoles, templateVisibleFor, type ResourceRole } from "@/lib/resource-roles";
import { getSubscriptionProgress } from "@/lib/subscription-progress";

export default async function PatientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const user = await getActiveProfessional();
  if (!user) redirect("/");

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: { appliedLevel: { include: { profile: true } } },
  });
  if (!patient) notFound();

  // Fisios normales solo pueden entrar a SUS pacientes
  if (!user.isManager && patient.assignedProfessionalId !== user.id) {
    redirect("/fisio/pacientes");
  }

  // Progreso teniendo en cuenta pausas + semana actual del atleta.
  const subProgress = await getSubscriptionProgress({
    id: patient.id,
    subscriptionStartDate: patient.subscriptionStartDate,
    subscriptionPeriodMonths: patient.subscriptionPeriodMonths,
    subscriptionTotalMonths: patient.subscriptionTotalMonths,
  });
  const consumed = subProgress.consumedMonths;
  const total = subProgress.totalMonths || patient.subscriptionTotalMonths || 4;
  const adherence = await calculateAdherence(patient.id);
  const clinicalCase = await prisma.clinicalSessionCase.findUnique({
    where: { patientId: patient.id },
    select: { id: true },
  });

  // Progreso de Classroom (Comunidad) — dato secundario, se muestra discreto.
  const [classroomLessons, classroomDone] = await Promise.all([
    prisma.communityLesson.count({ where: { section: { module: { published: true } } } }),
    prisma.communityLessonProgress.count({ where: { patientId: patient.id, lesson: { section: { module: { published: true } } } } }),
  ]);
  const classroomPct = classroomLessons > 0 ? Math.round((classroomDone / classroomLessons) * 100) : null;

  // Plantillas de "envío rápido" para el fisio: cualquier MessageTemplate con
  // actionType de tipo directo (agenda, recordatorio cita) visible para su rol.
  // El botón solo aparece si hay alguna.
  // También cargamos la propia closerIntro del usuario logueado para que
  // {closer.intro} se interpole correctamente cuando envía desde aquí.
  const userRole = user.role as ResourceRole;
  const [actionTemplatesRaw, currentUserFull] = await Promise.all([
    prisma.messageTemplate.findMany({
      where: { actionType: { in: ["send_agenda", "send_meeting_reminder"] } },
      select: { id: true, name: true, body: true, targetRoles: true, actionType: true },
    }),
    prisma.professional.findUnique({
      where: { id: user.id },
      select: { closerIntro: true },
    }),
  ]);
  const patientActionTemplates = actionTemplatesRaw
    .filter((t) => templateVisibleFor(parseTargetRoles(t.targetRoles), userRole))
    .map((t) => ({ id: t.id, name: t.name, body: t.body, actionType: t.actionType! as any }));

  return (
    <div>
      <header className="mb-4">
        <Link href="/fisio/pacientes" className="text-xs text-neutral-500">← Pacientes</Link>
        <div className="flex items-start justify-between gap-3 mt-1 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-xl font-semibold">{patient.fullName}</h1>
              {(patient as any).isTest && (
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: "#F3E8FF", color: "#6B21A8" }}
                  title="Paciente fantasma — no cuenta en KPIs, alertas ni resúmenes"
                >
                  👻 Fantasma
                </span>
              )}
              <PatientPill value={patient.programType} kind="program" />
              {user.isManager && <PatientPill value={patient.difficulty} kind="difficulty" />}
              <span className="text-sm text-neutral-500">{patient.diagnosis}</span>
            </div>
            {patient.appliedLevel && (
              <p className="text-xs text-emerald-700 mt-1">
                ✓ Perfil aplicado: <span className="font-medium">{patient.appliedLevel.profile.name}</span> · {patient.appliedLevel.name}
              </p>
            )}
            {classroomPct !== null && (
              <p className="text-xs text-neutral-400 mt-1" title="Progreso del paciente en los cursos de la Comunidad">
                🎓 Classroom: {classroomDone}/{classroomLessons} lecciones ({classroomPct}%)
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <LoadReviewIntervalSelector
              patientId={patient.id}
              initialWeeks={patient.loadReviewIntervalWeeks ?? 4}
            />
            <PatientNotesButton
              patientId={patient.id}
              initialNotes={patient.fisioNotes ?? null}
            />
            <GoToPatient />
            <PatientAgendaButton
              templates={patientActionTemplates}
              patientName={patient.fullName}
              patientPhone={patient.shippingPhone}
              fisioFullName={user.fullName}
              fisioIntro={currentUserFull?.closerIntro ?? null}
            />
            <WhatsAppButton url={patient.whatsappGroupUrl} size="md" />
            {patient.subscriptionStartDate && (
              <div className="bg-neutral-50 rounded-xl px-3 py-2 flex flex-col items-center gap-0.5">
                <ProgressRing value={consumed} max={total} label="suscripción" mode="subscription" />
                {subProgress.currentWeek !== null && (
                  <div
                    className="text-[10px] font-semibold tracking-wider uppercase"
                    style={{ color: subProgress.isPaused ? "#B45309" : "#525252" }}
                    title={subProgress.isPaused ? "Congelado por pausa activa" : "Semana actual del programa"}
                  >
                    Semana {subProgress.currentWeek}
                    {subProgress.isPaused && " · ⏸"}
                  </div>
                )}
              </div>
            )}
            <div className="bg-neutral-50 rounded-xl px-3 py-2">
              <ProgressRing value={adherence.completed} max={adherence.total} label="cumplimiento" mode="adherence" />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Sidebar + acciones secundarias en la misma columna (link de acceso
            y exportar PDF antes vivían en el header, lo saturaban). */}
        <div className="md:w-56 md:flex-shrink-0 space-y-2">
          <PatientSidebar patientId={patient.id} hasClinicalCase={!!clinicalCase} />
          <div className="flex flex-col gap-1.5 mt-2 md:mt-3 md:pt-3 md:border-t md:border-neutral-200">
            <PatientAccessLinkButton patientId={patient.id} patientName={patient.fullName} />
            {(user.role === "ceo" || user.role === "head_success") && (
              <SendLoginCodeButton patientId={patient.id} />
            )}
            {(user.role === "ceo" || user.role === "head_success") &&
              !patient.giftsAlreadySent &&
              patient.onboardingTasks != null && (
                <MarkAsLegacyButton
                  patientId={patient.id}
                  patientName={patient.fullName}
                  currentSubscriptionStartDate={
                    patient.subscriptionStartDate?.toISOString() ?? null
                  }
                />
              )}
            <MetricAlertsPatientButton patientId={patient.id} />
            {user.role === "ceo" && (
              <PatientTestModeToggle
                patientId={patient.id}
                initial={!!(patient as any).isTest}
                patientName={patient.fullName}
              />
            )}
            <Link
              href={`/fisio/paciente/${patient.id}/exportar`}
              className="btn btn-ghost text-xs justify-start"
              title="Exportar toda la información del paciente en PDF"
            >
              🖨️ Exportar PDF
            </Link>
          </div>
        </div>
        <main className="flex-1 min-w-0">
          <PatientAlertsCard patientId={patient.id} />
          {children}
        </main>
      </div>
    </div>
  );
}
