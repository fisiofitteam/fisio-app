import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { CombinedSessionRunner, type CombinedGroup } from "@/components/CombinedSessionRunner";

const DAY_NAMES = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default async function CombinedSessionTodayPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, whatsappGroupUrl: true },
  });
  if (!patient) notFound();

  // Sesiones de hoy NO completadas (de programas fijos del paciente).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const sessions = await prisma.programSession.findMany({
    where: {
      assignment: { patientId: patient.id, isActive: true },
      scheduledDate: { gte: today, lt: tomorrow },
      completedAt: null,
    },
    include: { assignment: { include: { program: true } } },
    orderBy: { scheduledDate: "asc" },
  });

  if (sessions.length === 0) {
    redirect(`/paciente/${patient.id}`);
  }

  // Si solo hay 1 sesión, usar la ruta clásica (mantiene UX exacta).
  if (sessions.length === 1) {
    redirect(`/paciente/${patient.id}/sesion/${sessions[0].id}`);
  }

  const groups: CombinedGroup[] = sessions.map((s) => {
    let tasks: any[] = [];
    try {
      const arr = JSON.parse(s.tasksSnapshot);
      if (Array.isArray(arr)) tasks = arr;
    } catch {}
    return {
      sessionId: s.id,
      programName: s.assignment.program.name,
      tasks,
    };
  });

  const dow = today.getDay() === 0 ? 7 : today.getDay();

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-24">
      <header className="mb-4">
        <Link href={`/paciente/${params.id}`} className="text-xs text-neutral-500">← Tu semana</Link>
        <h1 className="text-xl font-semibold mt-1">Sesión de hoy</h1>
        <p className="text-sm text-neutral-500">
          {DAY_NAMES[dow]} · {today.toLocaleDateString("es-ES", { day: "numeric", month: "long" })} ·{" "}
          {groups.length} programa{groups.length !== 1 ? "s" : ""}
        </p>
      </header>

      <CombinedSessionRunner
        patientId={patient.id}
        groups={groups}
        whatsappUrl={patient.whatsappGroupUrl}
      />

      <PatientNav patientId={patient.id} active="home" />
    </main>
  );
}
