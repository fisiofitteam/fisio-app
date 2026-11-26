import { redirect } from "next/navigation";
import { founderSession } from "@/lib/grok-ceo-exchange";
import { CeoDirectionPanel } from "@/components/CeoDirectionPanel";
export const dynamic = "force-dynamic";
export default async function DirectionPage() {
  if (!await founderSession()) redirect("/fisio");
  return <main className="max-w-6xl mx-auto px-4 py-6"><CeoDirectionPanel/></main>;
}
