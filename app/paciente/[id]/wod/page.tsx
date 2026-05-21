import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { WodAdapter } from "@/components/WodAdapter";

export default async function WodPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) notFound();

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-24">
      <header className="mb-4">
        <Link href={`/paciente/${patient.id}`} className="text-xs text-neutral-500">← Inicio</Link>
        <h1 className="text-xl font-semibold mt-1">Adaptar WOD</h1>
        <p className="text-sm text-neutral-500">Pega o escribe el WOD del box</p>
      </header>

      <WodAdapter patientId={patient.id} />

      <PatientNav patientId={patient.id} active="wod" />
    </main>
  );
}
