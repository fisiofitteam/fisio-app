import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { SessionRunner } from "@/components/SessionRunner";

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
  const tasks = JSON.parse(session.tasksSnapshot) as any[];

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-24">
      <header className="mb-4">
        <Link href={`/paciente/${params.id}`} className="text-xs text-neutral-500">← Tu semana</Link>
        <h1 className="text-xl font-semibold mt-1">{DAY_NAMES[dow]}</h1>
        <p className="text-sm text-neutral-500">
          {date.toLocaleDateString("es-ES", { day: "numeric", month: "long" })} ·{" "}
          {session.assignment.program.name}
        </p>
      </header>

      <SessionRunner
        sessionId={session.id}
        patientId={params.id}
        tasks={tasks}
        completed={!!session.completedAt}
        existingResponses={session.responses}
      />

      <PatientNav patientId={params.id} active="home" />
    </main>
  );
}
