// Layout común para todas las páginas del paciente.
// Además del envoltorio visual (PatientShell), aplica el GATE de onboarding: si
// el paciente no ha completado anamnesis + contrato, se le redirige al onboarding
// y no puede usar la app hasta terminarlo. (El onboarding vive en
// /paciente/onboarding, fuera de este layout, para evitar bucles de redirección.)
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientShell } from "@/components/PatientShell";
import { needsOnboarding } from "@/lib/onboarding-content";

export default async function PatientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { onboardingTasks: true },
  });

  if (patient && needsOnboarding(patient.onboardingTasks)) {
    redirect("/paciente/onboarding");
  }

  return <PatientShell>{children}</PatientShell>;
}
