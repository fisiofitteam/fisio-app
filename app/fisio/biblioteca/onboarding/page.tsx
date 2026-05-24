import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { getOnboardingConfig } from "@/lib/onboarding-config";
import { OnboardingConfigEditor } from "@/components/OnboardingConfigEditor";

export default async function OnboardingConfigPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio/biblioteca");

  const config = await getOnboardingConfig();

  return (
    <OnboardingConfigEditor
      initialSteps={config.anamnesisSteps}
      initialContractText={config.contractText}
      initialContractVersion={config.contractVersion}
    />
  );
}
