import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { getSessionUser } from "@/lib/session";
import { PatientWodHistory } from "@/components/PatientWodHistory";
import { WodAdapter } from "@/components/WodAdapter";

export const dynamic = "force-dynamic";

export default async function WodPage({ params, searchParams }: { params: { id: string }; searchParams: { historyPage?: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/paciente/login");
  if (user.kind === "patient" && user.patient.id !== params.id) notFound();
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) notFound();
  if (user.kind === "professional" && !user.pro.isManager && patient.assignedProfessionalId !== user.pro.id) notFound();

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-24">
      <header className="mb-4">
        <Link href={`/paciente/${patient.id}`} className="text-xs text-neutral-500">← Inicio</Link>
        <h1 className="text-xl font-semibold mt-1">Adaptar WOD</h1>
        <p className="text-sm text-neutral-500">Pega o escribe el WOD del box</p>
      </header>

      <div
        className="rounded-2xl border-2 p-3 mb-4 text-sm"
        style={{ background: "#FEF2F2", borderColor: "#DC2626", color: "#7F1D1D" }}
      >
        <div className="font-bold mb-1">⚠️ ¡ATENCIÓN!</div>
        <p className="leading-snug">
          El adaptador de cargas está en <strong>fase beta</strong> y puede cometer algunos errores.
          Aplica siempre el sentido común y, por supuesto, si tienes dudas, pregúntanos por el
          grupo de seguimiento antes de tirarte a la piscina.
        </p>
      </div>

      <a href="#historial-wods" className="btn w-full mb-4">Ver mi historial de WODs ↓</a>
      <WodAdapter patientId={patient.id} />
      <PatientWodHistory patientId={patient.id} pageParam={searchParams.historyPage} />

      <PatientNav patientId={patient.id} active="wod" />
    </main>
  );
}
