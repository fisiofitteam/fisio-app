import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { PatientNav } from "@/components/PatientNav";
import { PatientWodHistory } from "@/components/PatientWodHistory";

export const dynamic = "force-dynamic";

export default async function WodHistoryPage({ params, searchParams }: {
  params: { id: string };
  searchParams: { historyPage?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/paciente/login");
  if (user.kind === "patient" && user.patient.id !== params.id) notFound();
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, assignedProfessionalId: true },
  });
  if (!patient) notFound();
  if (user.kind === "professional" && !user.pro.isManager && patient.assignedProfessionalId !== user.pro.id) notFound();

  return (
    <main className="max-w-md mx-auto px-4 py-6 pb-24">
      <Link href={`/paciente/${patient.id}/wod`} className="text-sm text-neutral-500">← Volver al adaptador</Link>
      <PatientWodHistory patientId={patient.id} pageParam={searchParams.historyPage} />
      <PatientNav patientId={patient.id} active="wod" />
    </main>
  );
}
