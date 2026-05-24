import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { getRenewalLandingCopy } from "@/lib/landing-config";
import { LandingConfigEditor } from "@/components/LandingConfigEditor";

export default async function LandingsConfigPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio/biblioteca");

  const renewal = await getRenewalLandingCopy();

  return <LandingConfigEditor initialRenewal={renewal} />;
}
