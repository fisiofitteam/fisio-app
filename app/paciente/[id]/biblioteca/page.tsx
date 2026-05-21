import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";

export default async function PatientLibraryPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) notFound();

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-24">
      <header className="mb-6">
        <Link href={`/paciente/${patient.id}`} className="text-xs text-neutral-500">← Inicio</Link>
        <h1 className="text-xl font-semibold mt-1">Biblioteca</h1>
        <p className="text-sm text-neutral-500">Recursos y vídeos seleccionados por tu fisio</p>
      </header>

      <div className="card text-center py-10">
        <div className="text-4xl mb-3">📚</div>
        <h2 className="font-semibold text-base mb-1">Próximamente</h2>
        <p className="text-sm text-neutral-600 max-w-xs mx-auto">
          Tu fisio podrá compartir contigo vídeos de técnica, formularios y recursos personalizados.
        </p>
      </div>

      <PatientNav patientId={patient.id} active="home" />
    </main>
  );
}
