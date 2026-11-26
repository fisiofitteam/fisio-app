import Link from "next/link";
import { redirect } from "next/navigation";
import { BrainCircuit } from "lucide-react";
import { getActiveProfessional } from "@/lib/session";
import { CeoIaNavigation } from "@/components/CeoIaNavigation";
export const dynamic = "force-dynamic";

export default async function CeoIaLayout({ children }: { children: React.ReactNode }) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") redirect("/fisio");
  const isFounder = user.id === process.env.GROK_CEO_FOUNDER_ID;
  return <main className="max-w-6xl mx-auto px-3 sm:px-4 py-6">
    <header className="mb-5">
      <Link href="/fisio" className="text-xs text-neutral-500 hover:underline">← Panel principal</Link>
      <div className="flex items-center gap-3 mt-3">
        <div className="rounded-xl bg-neutral-900 p-3 text-amber-400"><BrainCircuit size={26} /></div>
        <div><h1 className="text-2xl font-semibold tracking-tight">CEO IA</h1>
          <p className="text-sm text-neutral-500 mt-1">Tu espacio de análisis, comunicaciones y dirección de FisioFitCross.</p></div>
      </div>
    </header>
    <CeoIaNavigation isFounder={isFounder} />
    {children}
  </main>;
}
