"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Period = "month" | "quarter" | "year";
type AdRow = {
  id: string; name: string; spend: number; reach: number; impressions: number; frequency: number;
  clicks: number; linkClicks: number; ctr: number; cpc: number; cpm: number; results: number; costPerResult: number | null;
};

const eur = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;
const eur2 = (n: number) => `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const int = (n: number) => n.toLocaleString("es-ES");

export function AdsPanel({ period, periodLabel, campaigns, error }: { period: Period; periodLabel: string; campaigns: AdRow[]; error: string | null }) {
  const router = useRouter();
  const [children, setChildren] = useState<Record<string, AdRow[] | "loading">>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function switchPeriod(p: Period) {
    const url = new URL(window.location.href);
    url.searchParams.set("period", p);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  async function toggle(row: AdRow, level: number) {
    const next = new Set(expanded);
    if (next.has(row.id)) { next.delete(row.id); setExpanded(next); return; }
    next.add(row.id);
    setExpanded(next);
    if (!children[row.id]) {
      setChildren((c) => ({ ...c, [row.id]: "loading" }));
      const childLevel = level === 0 ? "adset" : "ad";
      try {
        const res = await fetch(`/api/integrations/meta/ads-insights?period=${period}&level=${childLevel}&parentId=${row.id}`, { cache: "no-store" });
        const d = await res.json();
        setChildren((c) => ({ ...c, [row.id]: d.rows ?? [] }));
      } catch {
        setChildren((c) => ({ ...c, [row.id]: [] }));
      }
    }
  }

  // Totales (ratios recalculados desde las sumas)
  const t = campaigns.reduce((a, c) => ({
    spend: a.spend + c.spend, reach: a.reach + c.reach, impressions: a.impressions + c.impressions,
    clicks: a.clicks + c.clicks, linkClicks: a.linkClicks + c.linkClicks, results: a.results + c.results,
  }), { spend: 0, reach: 0, impressions: 0, clicks: 0, linkClicks: 0, results: 0 });
  const ctr = t.impressions > 0 ? Math.round((t.clicks / t.impressions) * 10000) / 100 : 0;
  const cpc = t.linkClicks > 0 ? t.spend / t.linkClicks : 0;
  const cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0;
  const cpl = t.results > 0 ? t.spend / t.results : null;

  return (
    <div>
      <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
        <div>
          <h2 className="font-semibold text-sm">Anuncios</h2>
          <p className="text-xs text-neutral-500 capitalize">{periodLabel}</p>
        </div>
        <div className="flex bg-neutral-100 rounded-lg p-0.5">
          {(["month", "quarter", "year"] as Period[]).map((p) => (
            <button key={p} onClick={() => switchPeriod(p)} className={`px-3 py-1 text-xs rounded-md transition-colors ${period === p ? "bg-white shadow-sm font-medium" : "text-neutral-600 hover:text-neutral-900"}`}>
              {p === "month" ? "Mensual" : p === "quarter" ? "Trimestral" : "Anual"}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="card bg-amber-50 border-amber-200 text-sm text-amber-900 mb-4">⚠ {error}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
        <Kpi label="Gasto" value={eur(t.spend)} />
        <Kpi label="Impresiones" value={int(t.impressions)} />
        <Kpi label="Alcance" value={int(t.reach)} />
        <Kpi label="Clics (enlace)" value={int(t.linkClicks)} />
        <Kpi label="CTR" value={`${ctr}%`} />
        <Kpi label="CPC" value={eur2(cpc)} />
        <Kpi label="CPM" value={eur2(cpm)} />
        <Kpi label="Resultados" value={int(t.results)} tone="emerald" />
        <Kpi label="Coste / resultado" value={cpl !== null ? eur2(cpl) : "—"} tone="emerald" />
      </div>

      {campaigns.length === 0 ? (
        <p className="text-sm text-neutral-400 italic py-6 text-center">Sin campañas con gasto en este periodo.</p>
      ) : (
        <section className="card p-0 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200 bg-neutral-50">
                <th className="text-left py-2 px-3 font-medium sticky left-0 bg-neutral-50 z-10 min-w-[220px]">Campaña / conjunto / anuncio</th>
                <th className="text-right py-2 px-2 font-medium">Gasto</th>
                <th className="text-right py-2 px-2 font-medium">Impr.</th>
                <th className="text-right py-2 px-2 font-medium">Alcance</th>
                <th className="text-right py-2 px-2 font-medium">Frec.</th>
                <th className="text-right py-2 px-2 font-medium">Clics</th>
                <th className="text-right py-2 px-2 font-medium">CTR</th>
                <th className="text-right py-2 px-2 font-medium">CPC</th>
                <th className="text-right py-2 px-2 font-medium">CPM</th>
                <th className="text-right py-2 px-2 font-medium">Result.</th>
                <th className="text-right py-2 px-3 font-medium">€/result.</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <Rows key={c.id} row={c} level={0} expanded={expanded} children={children} onToggle={toggle} />
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Rows({ row, level, expanded, children, onToggle }: {
  row: AdRow; level: number; expanded: Set<string>;
  children: Record<string, AdRow[] | "loading">; onToggle: (r: AdRow, level: number) => void;
}) {
  const canExpand = level < 2;
  const isOpen = expanded.has(row.id);
  const kids = children[row.id];
  return (
    <>
      <tr className="border-b border-neutral-100 hover:bg-neutral-50">
        <td className="py-2 px-3 sticky left-0 bg-white z-10" style={{ paddingLeft: 12 + level * 18 }}>
          <button onClick={() => canExpand && onToggle(row, level)} className="flex items-center gap-1.5 text-left" disabled={!canExpand}>
            {canExpand ? <span className="text-neutral-400 w-3 inline-block">{isOpen ? "▾" : "▸"}</span> : <span className="w-3 inline-block" />}
            <span className={level === 0 ? "font-medium" : "text-neutral-600"}>{row.name}</span>
          </button>
        </td>
        <td className="py-2 px-2 text-right tabular-nums font-medium">{eur(row.spend)}</td>
        <td className="py-2 px-2 text-right tabular-nums">{int(row.impressions)}</td>
        <td className="py-2 px-2 text-right tabular-nums">{int(row.reach)}</td>
        <td className="py-2 px-2 text-right tabular-nums">{row.frequency || "—"}</td>
        <td className="py-2 px-2 text-right tabular-nums">{int(row.linkClicks)}</td>
        <td className="py-2 px-2 text-right tabular-nums">{row.ctr ? `${row.ctr}%` : "—"}</td>
        <td className="py-2 px-2 text-right tabular-nums">{row.cpc ? eur2(row.cpc) : "—"}</td>
        <td className="py-2 px-2 text-right tabular-nums">{row.cpm ? eur2(row.cpm) : "—"}</td>
        <td className="py-2 px-2 text-right tabular-nums font-medium text-emerald-700">{row.results || "—"}</td>
        <td className="py-2 px-3 text-right tabular-nums text-emerald-700">{row.costPerResult !== null ? eur2(row.costPerResult) : "—"}</td>
      </tr>
      {isOpen && kids === "loading" && (
        <tr><td colSpan={11} className="py-2 px-3 text-xs text-neutral-400 italic" style={{ paddingLeft: 12 + (level + 1) * 18 }}>Cargando…</td></tr>
      )}
      {isOpen && Array.isArray(kids) && kids.length === 0 && (
        <tr><td colSpan={11} className="py-2 px-3 text-xs text-neutral-400 italic" style={{ paddingLeft: 12 + (level + 1) * 18 }}>Sin datos.</td></tr>
      )}
      {isOpen && Array.isArray(kids) && kids.map((k) => (
        <Rows key={k.id} row={k} level={level + 1} expanded={expanded} children={children} onToggle={onToggle} />
      ))}
    </>
  );
}

function Kpi({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "emerald" }) {
  return (
    <div className="card">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className={`text-xl font-semibold ${tone === "emerald" ? "text-emerald-700" : "text-neutral-900"}`}>{value}</div>
    </div>
  );
}
