import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { SessionRunner } from "@/components/SessionRunner";
import { parseAndSortTasksSnapshot } from "@/lib/task-order";

const DAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export default async function PatientSessionPage({
  params,
}: {
  params: { id: string; sessionId: string };
}) {
  const session = await prisma.programSession.findUnique({
    where: { id: params.sessionId },
    include: { assignment: { include: { program: true, patient: true } } },
  });
  if (!session) notFound();
  if (session.assignment.patientId !== params.id) notFound();

  const date = new Date(session.scheduledDate);
  const dow = date.getDay() === 0 ? 7 : date.getDay();
  const tasks = parseAndSortTasksSnapshot(session.tasksSnapshot);

  return (
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        <Link
          href={`/paciente/${params.id}`}
          className="inline-flex items-center gap-1 text-xs mb-6"
          style={{ color: "var(--p-text-faint)" }}
        >
          <ArrowLeft size={12} /> Volver al inicio
        </Link>

        <header className="mb-6">
          <div className="text-[10px] font-bold tracking-wider uppercase mb-1" style={{ color: "var(--p-text-faint)" }}>
            {DAY_NAMES[dow]} · {date.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-2" style={{ letterSpacing: "-0.03em" }}>
            💪 Tu sesión
          </h1>
        </header>

        <SessionRunner
          sessionId={session.id}
          patientId={params.id}
          tasks={tasks}
          completed={!!session.completedAt}
          existingResponses={session.responses}
          existingPatientNotes={session.patientNotes ?? null}
          whatsappUrl={session.assignment.patient.whatsappGroupUrl}
        />

        <PatientNav patientId={params.id} active="home" />
      </div>
    </main>
  );
}
