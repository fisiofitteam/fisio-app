import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { PatientPRsClient } from "@/components/PatientPRsClient";

export const dynamic = "force-dynamic";

export default async function PatientPRsPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, fullName: true },
  });
  if (!patient) notFound();

  const prs = await prisma.patientPR.findMany({
    where: { patientId: patient.id },
    orderBy: { recordedAt: "desc" },
  });

  return (
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        <header className="mb-5">
          <Link href={`/paciente/${patient.id}`} className="text-xs" style={{ color: "var(--p-text-faint)" }}>← Inicio</Link>
          <h1 className="text-2xl font-bold mt-1" style={{ letterSpacing: "-0.025em" }}>🏆 Mis PRs</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--p-text-dim)" }}>
            Tus máximos personales. Añádelos y revísalos cuando quieras.
          </p>
        </header>

        <PatientPRsClient
          initial={prs.map((p) => ({
            id: p.id,
            name: p.name,
            value: p.value,
            unit: p.unit,
            notes: p.notes,
            recordedAt: p.recordedAt.toISOString(),
          }))}
        />
      </div>

      <PatientNav patientId={patient.id} active="" />
    </main>
  );
}
