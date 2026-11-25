"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BrainCircuit } from "lucide-react";
type Brief = { id: string; periodLabel: string; generatedAt: string; narrative: { resumenEjecutivo: string; accionesRecomendadas: string[]; decisionesFounder?: string[] } };
export function GrokCeoBriefing() {
  const [report, setReport] = useState<Brief | null>(null);
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/ceo/grok-latest", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (active) { setReport(data.report); setStatus("ready"); }
      } catch { if (active) setStatus("error"); }
    }
    void load();
    const timer = setInterval(load, 60000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return <section className="card mb-4 border border-amber-200 p-4">
    <div className="flex items-center gap-3 mb-3">
      <div className="bg-neutral-900 text-amber-400 rounded-lg p-2"><BrainCircuit size={24} /></div>
      <div className="flex-1"><h2 className="font-semibold">Tu CEO IA</h2><p className="text-xs text-neutral-500">{report ? new Date(report.generatedAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : "Dirección empresarial"}</p></div>
      <Link href={report ? "/fisio/informe-ceo?report=" + report.id : "/fisio/informe-ceo"} className="text-xs underline">Ver informes</Link>
    </div>
    {status === "error" ? <p className="text-sm text-neutral-500">Informe temporalmente no disponible.</p> : !report ? <p className="text-sm text-neutral-500">{status === "loading" ? "Cargando…" : "Aún no hay informes de Grok."}</p> : <>
      <p className="text-sm whitespace-pre-wrap">{report.narrative.resumenEjecutivo}</p>
      <h3 className="text-xs font-semibold mt-3 mb-1">Prioridades de hoy</h3>
      <ol className="text-sm list-decimal pl-5 space-y-1">{report.narrative.accionesRecomendadas.map((a,i) => <li key={i}>{a}</li>)}</ol>
      {!!report.narrative.decisionesFounder?.length && <div className="mt-3 border-t pt-2"><h3 className="text-sm font-semibold">Requiere tu decisión</h3><ul className="text-sm list-disc pl-5">{report.narrative.decisionesFounder.map((a,i) => <li key={i}>{a}</li>)}</ul></div>}
    </>}
  </section>;
}
