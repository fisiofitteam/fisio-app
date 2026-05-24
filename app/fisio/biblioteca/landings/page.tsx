import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { getRenewalLandingCopy, getContractLandingCopy, getAgendaLandingCopy } from "@/lib/landing-config";
import { LandingConfigEditor } from "@/components/LandingConfigEditor";

export default async function LandingsConfigPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio/biblioteca");

  const [renewal, contract, agenda] = await Promise.all([
    getRenewalLandingCopy(),
    getContractLandingCopy(),
    getAgendaLandingCopy(),
  ]);

  return <LandingConfigEditor initialRenewal={renewal} initialContract={contract} initialAgenda={agenda} />;
}
