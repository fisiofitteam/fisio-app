import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";

export const dynamic = "force-dynamic";

export default async function PatientMetricsPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!patient) notFound();

  return (
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        <header className="mb-5">
          <Link href={`/paciente/${patient.id}`} className="text-xs" style={{ color: "var(--p-text-faint)" }}>← Inicio</Link>
          <h1 className="text-2xl font-bold mt-1" style={{ letterSpacing: "-0.025em" }}>📊 Mis métricas</h1>
        </header>

        <section
          className="rounded-2xl p-6 text-center"
          style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
        >
          <div className="text-4xl mb-2">📊</div>
          <h2 className="font-semibold text-base mb-2">Próximamente</h2>
          <p className="text-sm" style={{ color: "var(--p-text-dim)" }}>
            Aquí podrás registrar tu fatiga percibida, RPE, calidad de sueño y otras métricas
            que tu coach configure para seguir tu progreso día a día.
          </p>
        </section>
      </div>

      <PatientNav patientId={patient.id} active="" />
    </main>
  );
}
