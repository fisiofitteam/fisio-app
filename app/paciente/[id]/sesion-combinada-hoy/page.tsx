import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { CombinedSessionRunner, type CombinedGroup } from "@/components/CombinedSessionRunner";
import { todayForPatient, dowForPatient } from "@/lib/patient-dates";
import { parseAndSortTasksSnapshot } from "@/lib/task-order";

const DAY_NAMES = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default async function CombinedSessionTodayPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, whatsappGroupUrl: true, timezone: true },
  });
  if (!patient) notFound();

  // "Hoy" en la TZ del paciente — no la del server ni Madrid.
  const today = todayForPatient(patient.timezone);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(today.getUTCDate() + 1);

  // Cargamos TODAS las sesiones de hoy (completadas incluidas). Antes
  // filtrabamos por completedAt: null y, si un atleta tenía 2+ sesiones y
  // ya las había completado, esta ruta rebotaba al home — el botón
  // "Trabajo específico" parecía roto. Ahora si hay alguna pendiente el
  // runner sigue en marcha; si están todas completadas dejamos al menos
  // ver la primera para revisarla.
  const sessions = await prisma.programSession.findMany({
    where: {
      assignment: { patientId: patient.id, isActive: true },
      scheduledDate: { gte: today, lt: tomorrow },
    },
    include: { assignment: { include: { program: true } } },
    orderBy: { scheduledDate: "asc" },
  });

  if (sessions.length === 0) {
    redirect(`/paciente/${patient.id}`);
  }

  // Si solo hay 1 sesión, usar la ruta clásica (maneja completed).
  if (sessions.length === 1) {
    redirect(`/paciente/${patient.id}/sesion/${sessions[0].id}`);
  }

  // Multi-sesión pero todas completadas: mandamos a la primera individual
  // — CombinedSessionRunner no sabe pintar respuestas guardadas, así que
  // al menos el atleta puede revisar una de ellas.
  const anyPending = sessions.some((s) => s.completedAt === null);
  if (!anyPending) {
    redirect(`/paciente/${patient.id}/sesion/${sessions[0].id}`);
  }

  const groups: CombinedGroup[] = sessions.map((s) => {
    const tasks = parseAndSortTasksSnapshot(s.tasksSnapshot);
    return {
      sessionId: s.id,
      programName: s.assignment.program.name,
      tasks,
    };
  });

  const dow = dowForPatient(patient.timezone);

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-24">
      <header className="mb-4">
        <Link href={`/paciente/${params.id}`} className="text-xs text-neutral-500">← Tu semana</Link>
        <h1 className="text-xl font-semibold mt-1">Sesión de hoy</h1>
        <p className="text-sm text-neutral-500">
          {DAY_NAMES[dow]} · {today.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}
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
