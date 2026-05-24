import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/auth";
import { PatientShell } from "@/components/PatientShell";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { needsOnboarding, parseOnboardingTasks } from "@/lib/onboarding-content";
import { getOnboardingConfig } from "@/lib/onboarding-config";

export default async function OnboardingPage() {
  const active = await getActivePatient();
  if (!active) redirect("/paciente/login");

  const patient = await prisma.patient.findUnique({
    where: { id: active.id },
    select: {
      id: true,
      fullName: true,
      onboardingTasks: true,
      anamnesisData: true,
    },
  });
  if (!patient) redirect("/paciente/login");

  // Ya completado (o paciente legacy sin onboarding) → directo a la app
  if (!needsOnboarding(patient.onboardingTasks)) {
    redirect(`/paciente/${patient.id}`);
  }

  const tasks = parseOnboardingTasks(patient.onboardingTasks);

  let anamnesisAnswers: Record<string, unknown> = {};
  if (patient.anamnesisData) {
    try {
      const parsed = JSON.parse(patient.anamnesisData);
      if (parsed && typeof parsed === "object") anamnesisAnswers = parsed;
    } catch {}
  }

  const config = await getOnboardingConfig();

  return (
    <PatientShell>
      <OnboardingFlow
        patientId={patient.id}
        firstName={patient.fullName.split(" ")[0]}
        initialTasks={{ anamnesis: Boolean(tasks.anamnesis), contract: Boolean(tasks.contract) }}
        initialAnamnesis={anamnesisAnswers}
        steps={config.anamnesisSteps}
        contractText={config.contractText}
      />
    </PatientShell>
  );
}
