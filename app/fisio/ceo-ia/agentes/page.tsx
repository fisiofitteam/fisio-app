import { redirect } from "next/navigation";
import { founderSession } from "@/lib/grok-ceo-exchange";
import { CeoAgentWorkspace } from "@/components/CeoAgentWorkspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!await founderSession()) redirect("/fisio/ceo-ia");
  return <CeoAgentWorkspace mode="agents" />;
}
