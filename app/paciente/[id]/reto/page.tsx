import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { PatientChallengeClient } from "@/components/PatientChallengeClient";

export const dynamic = "force-dynamic";

export default async function PatientChallengePage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, fullName: true, programMode: true, programType: true },
  });
  if (!patient) notFound();

  const now = new Date();
  const challenge = await prisma.monthlyChallenge.findUnique({
    where: { year_month: { year: now.getFullYear(), month: now.getMonth() } },
    include: {
      results: {
        include: { patient: { select: { id: true, fullName: true, photoUrl: true } } },
        orderBy: { recordedAt: "asc" },
      },
    },
  });

  return (
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        <header className="mb-5">
          <Link href={`/paciente/${patient.id}`} className="text-xs" style={{ color: "var(--p-text-faint)" }}>← Inicio</Link>
          <h1 className="text-2xl font-bold mt-1" style={{ letterSpacing: "-0.025em" }}>🎯 Reto del mes</h1>
        </header>

        {!challenge ? (
          <section className="rounded-2xl p-6 text-center" style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}>
            <div className="text-4xl mb-2">⚒️</div>
            <p className="text-sm" style={{ color: "var(--p-text-dim)" }}>
              Tu coach todavía no ha publicado el reto de este mes. Atento.
            </p>
          </section>
        ) : (
          <PatientChallengeClient
            patientId={patient.id}
            challenge={{
              id: challenge.id,
              title: challenge.title,
              description: challenge.description,
              metric: challenge.metric as "score" | "time",
              results: challenge.results.map((r) => ({
                id: r.id,
                patientId: r.patientId,
                value: r.value,
                unit: r.unit,
                notes: r.notes,
                recordedAt: r.recordedAt.toISOString(),
                patient: r.patient,
              })),
            }}
          />
        )}
      </div>

      <PatientNav patientId={patient.id} active="" variant="advance" />
    </main>
  );
}
