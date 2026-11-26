import { redirect } from "next/navigation";
import { founderSession } from "@/lib/grok-ceo-exchange";
import { BankFinancePanel } from "@/components/BankFinancePanel";
export const dynamic="force-dynamic";
export default async function BankPage(){
  if(!await founderSession())redirect("/fisio/finanzas");
  return <main className="max-w-6xl mx-auto"><BankFinancePanel/></main>;
}
