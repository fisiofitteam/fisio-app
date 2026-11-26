import { redirect } from "next/navigation";
import { founderSession } from "@/lib/grok-ceo-exchange";
import { BusinessExpenseCandidates } from "@/components/BusinessExpenseCandidates";
export const dynamic = "force-dynamic";
export default async function PendingExpensesPage() {
  if (!await founderSession()) redirect("/fisio/finanzas");
  return <main className="max-w-5xl mx-auto"><BusinessExpenseCandidates/></main>;
}
