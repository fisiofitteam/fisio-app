import { CeoAgentWorkspace } from "@/components/CeoAgentWorkspace";
import { GrokCeoBriefing } from "@/components/GrokCeoBriefing";
import { getActiveProfessional } from "@/lib/session";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function CeoIaPage() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") redirect("/fisio");
  return <div className="space-y-6">{user.id === process.env.GROK_CEO_FOUNDER_ID && <CeoAgentWorkspace mode="summary" />}<GrokCeoBriefing isFounder={user.id === process.env.GROK_CEO_FOUNDER_ID} /></div>;
}
