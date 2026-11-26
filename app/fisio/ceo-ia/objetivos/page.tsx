import { redirect } from "next/navigation";
import { founderSession } from "@/lib/grok-ceo-exchange";
import { CeoDirectionPanel } from "@/components/CeoDirectionPanel";
export const dynamic = "force-dynamic";
export default async function DirectionPage() {
  if (!await founderSession()) redirect("/fisio/ceo-ia");
  return <CeoDirectionPanel />;
}
