"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CeoDirectionSummary } from "./CeoDirectionSummary";
import { BrainCircuit, AlertTriangle, Target, ChevronDown } from "lucide-react";
type Period = { finance?: { income?: number | null; expense?: number | null }; sales?: { won?: number | null; lost?: number | null; closeRate?: number | null }; renewals?: { renewed?: number | null; lost?: number | null; renewalRate?: number | null }; leadsCreated?: number | null };
type Snapshot = Period & { previous7?: Period | null; last30?: Period | null; previous30?: Period | null };
type Brief = { id: string; periodLabel: string; generatedAt: string; metrics?: Snapshot | null; narrative: { resumenEjecutivo: string; accionesRecomendadas: string[]; decisionesFounder?: string[]; luces?: string[]; sombras?: string[]; alertas?: string[]; tendencias?: string[]; seguimiento?: string[] } };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const money = (v: number) => v.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const number = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 1 });
function Metric({ label, value, previous, unit = "count" }: { label: string; value?: number | null; previous?: number | null; unit?: "count" | "money" | "rate" }) {
  const format = (v: number) => unit === "money" ? money(v) : number(v) + (unit === "rate" ? "%" : "");
  const delta = finite(value) && finite(previous) ? (unit === "money" ? (previous !== 0 ? 100 * (value - previous) / Math.abs(previous) : null) : value - previous) : null;
  return <div className="rounded-xl border border-neutral-200 bg-white p-3 min-w-0">
    <p className="text-xs font-medium text-neutral-500">{label}</p>
    <p className="text-xl font-semibold tabular-nums text-neutral-900 mt-1 break-words">{finite(value) ? format(value) : "—"}</p>
    {finite(previous) && <p className="text-xs text-neutral-500 mt-1">Anterior: {format(previous)}</p>}
    {finite(delta) && <p className={"text-xs font-medium mt-1 " + (delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-700" : "text-neutral-500")}>{delta > 0 ? "+" : ""}{number(delta)}{unit === "rate" ? " pp" : unit === "money" ? "%" : ""} vs. anterior</p>}
  </div>;
}
function Items({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return <div><h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">{title}</h3><ul className="space-y-2 text-sm">{items.map((item,i) => <li key={i} className="flex gap-2"><span aria-hidden="true" className="text-neutral-400">•</span><span>{item}</span></li>)}</ul></div>;
}
export function GrokCeoBriefing({ isFounder = false }: { isFounder?: boolean }) {
  const [report, setReport] = useState<Brief | null>(null);
  const [status, setStatus] = useState("loading");
  const [period, setPeriod] = useState<7 | 30>(30);
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
  const snapshot = report?.metrics;
  const actualPeriod = period === 30 && snapshot?.last30 ? 30 : 7;
  const current = actualPeriod === 30 ? snapshot?.last30 : snapshot;
  const previous = actualPeriod === 30 ? snapshot?.previous30 : snapshot?.previous7;
  const n = report?.narrative;
  return <section className="card mb-4 border border-amber-200 p-4 md:p-5">
    <div className="flex items-center gap-3 mb-4">
      <div className="bg-neutral-900 text-amber-400 rounded-xl p-2.5"><BrainCircuit size={24} /></div>
      <div className="flex-1"><h2 className="font-semibold">Último informe</h2><p className="text-xs text-neutral-500">{report ? new Date(report.generatedAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : "Dirección empresarial"}</p></div>
      <div className="flex flex-col gap-1 text-right"><Link href={report ? "/fisio/ceo-ia/informes?report=" + report.id : "/fisio/ceo-ia/informes"} className="text-xs underline">Ver informes</Link>{isFounder && <Link href="/fisio/ceo-ia/semanal" className="text-xs underline">Estrategia semanal</Link>}</div>
    </div>
    {status === "error" && <p className="text-sm text-neutral-500">No se ha podido actualizar el informe.</p>}
    {!report || !n ? <p className="text-sm text-neutral-500">{status === "loading" ? "Cargando…" : "Aún no hay informes disponibles."}</p> : <div className="space-y-5">
      {current && <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Indicadores · últimos {actualPeriod} días completos</h3>
          {snapshot?.last30 && <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">{([7,30] as const).map(p => <button key={p} type="button" aria-pressed={actualPeriod === p} onClick={() => setPeriod(p)} className={"px-3 py-1 rounded-md text-xs font-medium " + (actualPeriod === p ? "bg-white shadow-sm text-neutral-900" : "text-neutral-600")}>{p} días</button>)}</div>}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <Metric label="Cobrado" value={current.finance?.income} previous={previous?.finance?.income} unit="money" />
          <Metric label="Cierre comercial" value={current.sales?.closeRate} previous={previous?.sales?.closeRate} unit="rate" />
          <Metric label="Ventas ganadas" value={current.sales?.won} previous={previous?.sales?.won} />
          <Metric label="Tasa de renovación" value={current.renewals?.renewalRate} previous={previous?.renewals?.renewalRate} unit="rate" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          <Metric label="Registros CRM" value={current.leadsCreated} previous={previous?.leadsCreated} />
          <Metric label="Ventas perdidas" value={current.sales?.lost} />
          <Metric label="Renovaciones ganadas" value={current.renewals?.renewed} />
          <Metric label="Renovaciones perdidas" value={current.renewals?.lost} />
        </div>
        <p className="text-xs text-neutral-500 mt-2">Datos del momento de publicación. CRM no equivale a contactos únicos. Cierre por fecha de decisión.</p>
        <p className="flex gap-2 text-xs text-amber-900 mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3"><AlertTriangle size={16} className="shrink-0" /> Gastos sin conciliación completa confirmada: no interpretar el resultado de caja como beneficio real.</p>
      </div>}
      {!!n.alertas?.length && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><Items title="Alertas de negocio" items={n.alertas} /></div>}
      <div className="grid md:grid-cols-2 gap-4"><Items title="Luces" items={n.luces} /><Items title="Sombras" items={n.sombras} /></div>
      <div className="border-t pt-4"><h3 className="flex items-center gap-2 font-semibold text-sm mb-3"><Target size={17} /> Prioridades de hoy</h3>
        <ol className="space-y-2">{n.accionesRecomendadas.map((a,i) => <li key={i} className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3 text-sm"><span className="font-semibold text-amber-800 tabular-nums">{String(i+1).padStart(2,"0")}</span><span>{a}</span></li>)}</ol>
      </div>

      <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium flex items-center gap-2"><ChevronDown size={16} /> Ver análisis completo de Grok</summary><p className="mt-3 text-sm whitespace-pre-wrap leading-relaxed">{n.resumenEjecutivo}</p><div className="grid md:grid-cols-2 gap-4 mt-4"><Items title="Tendencias" items={n.tendencias} /><Items title="Seguimiento" items={n.seguimiento} /></div></details>
    </div>}
    {isFounder && <div className="mt-5"><CeoDirectionSummary /></div>}
    {isFounder && <Link href={"/fisio/ceo-ia/comunicaciones" + (report ? "?report=" + report.id : "")} className="mt-4 flex flex-wrap justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
      <span><strong>Comunicaciones con tu CEO IA</strong><span className="block text-xs text-neutral-600 mt-1">{n?.decisionesFounder?.length ? n.decisionesFounder.length + " decisiones propuestas en este informe. Consulta el buzón para revisarlas." : "Envía encargos, consulta respuestas y registra tus decisiones."}</span></span><span className="font-medium">Abrir buzón →</span>
    </Link>}
  </section>;
}
