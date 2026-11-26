"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CeoBankSnapshot } from "./CeoBankSnapshot";
import { metricDefinitions } from "@/lib/ceo-direction-contract";
import type { directionSummary } from "@/lib/ceo-direction";
type Data = Awaited<ReturnType<typeof directionSummary>>;
export function CeoDirectionSummary() {
  const [data, setData] = useState<Data | null>(null), [error,setError] = useState(false);
  useEffect(() => { let active = true; async function load() { try { const r = await fetch("/api/ceo/direction?summary=1", {cache:"no-store"}); if (r.status === 403) return; if (!r.ok) throw new Error(); const j = await r.json(); if (active) {setData(j); setError(false);} } catch { if(active)setError(true); } } void load(); const timer = setInterval(load,60000); return () => {active=false;clearInterval(timer);}; },[]);
  if (!data) return error ? <p className="text-sm text-neutral-500">No se pudo actualizar dirección. <Link className="underline" href="/fisio/ceo-ia/objetivos">Abrir seguimiento</Link></p> : null;
  const alerts = data.targetStates.filter(x => x.state === "below");
  return <div className="space-y-3"><CeoBankSnapshot banking={data.banking}/><div className="rounded-xl border bg-white p-4 text-sm">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Seguimiento de dirección</h3><Link className="underline font-medium" href="/fisio/ceo-ia/objetivos">Objetivos, prioridades y resultados →</Link></div>
    <p className="text-xs text-neutral-600 mt-2">{data.counts.planned + data.counts.in_progress + data.counts.blocked} prioridades abiertas · {data.counts.done} completadas · {data.counts.blocked} bloqueadas</p>
    {!!alerts.length && <p className="text-amber-900 text-xs mt-2">Por debajo de tu objetivo: {alerts.map(a => metricDefinitions[a.key].label).join(", ")}.</p>}
    {!data.targets.length && <p className="text-xs text-neutral-500 mt-2">Puedes fijar tus objetivos numéricos en Objetivos y seguimiento.</p>}
  </div></div>;
}
