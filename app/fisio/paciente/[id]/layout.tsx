import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientSidebar } from "@/components/PatientSidebar";
import { ProgressRing } from "@/components/ProgressRing";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { PatientPill } from "@/components/PatientPills";
import { GoToPatient } from "@/components/GoToPatient";
import { calculateAdherence } from "@/lib/adherence";
import { getActiveProfessional } from "@/lib/session";

function monthsConsumed(startDate: Date | null): number {
  if (!startDate) return 0;
  const now = new Date();
  const diffMs = now.getTime() - new Date(startDate).getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 30.44));
}

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

  const consumed = monthsConsumed(patient.subscriptionStartDate);
  const total = patient.subscriptionTotalMonths || 4;
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

  return (
    <div>
      <header className="mb-4">
        <Link href="/fisio/pacientes" className="text-xs text-neutral-500">← Pacientes</Link>
        <div className="flex items-start justify-between gap-3 mt-1 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-xl font-semibold">{patient.fullName}</h1>
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
          <div className="flex items-center gap-2">
            <Link href={`/fisio/paciente/${patient.id}/exportar`} className="btn btn-ghost text-xs" title="Exportar toda la información del paciente en PDF">
              🖨️ Exportar PDF
            </Link>
            <GoToPatient />
            <WhatsAppButton url={patient.whatsappGroupUrl} size="md" />
            {patient.subscriptionStartDate && (
              <div className="bg-neutral-50 rounded-xl px-3 py-2">
                <ProgressRing value={consumed} max={total} label="suscripción" mode="subscription" />
              </div>
            )}
            <div className="bg-neutral-50 rounded-xl px-3 py-2">
              <ProgressRing value={adherence.completed} max={adherence.total} label="cumplimiento" mode="adherence" />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4">
        <PatientSidebar patientId={patient.id} hasClinicalCase={!!clinicalCase} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
