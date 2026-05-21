"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FORMAT_TEMPLATES, BODY_ZONES, WEEK_TYPES, type FormatKey } from "@/lib/content-templates";

type Totals = { reach: number; saves: number; shares: number; comments: number; dmKeyword: number; conversions: number };
type Deltas = { reach: number | null; saves: number | null; shares: number | null; comments: number | null; dmKeyword: number | null; conversions: number | null };

type FormatRow = {
  format: string;
  count: number;
  avgReach: number;
  avgSaves: number;
  avgComments: number;
  avgDmKeyword: number;
  avgConversions: number;
};

type ZoneRow = {
  zone: string;
  count: number;
  avgReach: number;
  avgSaves: number;
  totalDmKeyword: number;
  totalConversions: number;
};

type TopHook = {
  pieceId: string;
  hook: string;
  format: string;
  bodyZone: string;
  weekTheme: string;
  reach: number | null;
  saves: number | null;
  dmKeyword: number | null;
  conversions: number | null;
  score: number;
};

type LmRow = {
  id: string;
  name: string;
  keyword: string | null;
  active: boolean;
  lastPromotedAt: string | null;
};

type WeeklyRow = {
  id: string;
  label: string;
  theme: string;
  weekType: string;
  kpiName: string | null;
  kpiTarget: number | null;
  kpiActual: number | null;
  kpiStatus: "above" | "met" | "below" | "unknown";
};

export function MetricsView({
  range,
  rangeLabel,
  from,
  to,
  zoneFilter,
  typeFilter,
  formatsFilter,
  totals,
  deltas,
  piecesCount,
  formatRows,
  zoneRows,
  topHooks,
  leadMagnets,
  weeklyComparison,
}: {
  range: string;
  rangeLabel: string;
  from: string;
  to: string;
  zoneFilter: string;
  typeFilter: string;
  formatsFilter: string[];
  totals: Totals;
  deltas: Deltas;
  piecesCount: number;
  formatRows: FormatRow[];
  zoneRows: ZoneRow[];
  topHooks: TopHook[];
  leadMagnets: LmRow[];
  weeklyComparison: WeeklyRow[];
}) {
  const router = useRouter();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const [showCustom, setShowCustom] = useState(range === "custom");

  function navigate(params: Record<string, string>) {
    const url = new URL(window.location.href);
    for (const k in params) {
      if (params[k] === "" || params[k] === "all") url.searchParams.delete(k);
      else url.searchParams.set(k, params[k]);
    }
    router.push(url.pathname + url.search);
    router.refresh();
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    navigate({ range: "custom", from: customFrom, to: customTo });
  }

  function setRange(r: string) {
    if (r === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    navigate({ range: r, from: "", to: "" });
  }

  function toggleFormat(f: string) {
    const set = new Set(formatsFilter);
    if (set.has(f)) set.delete(f);
    else set.add(f);
    navigate({ formats: Array.from(set).join(",") });
  }

  return (
    <>
      <header className="mb-4 flex justify-between items-end flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Métricas</h1>
          <p className="text-xs text-neutral-500 mt-0.5">{rangeLabel} · {piecesCount} piezas publicadas</p>
        </div>
        <div className="flex gap-1 print:hidden">
          <button
            onClick={() => exportCsv({ rangeLabel, totals, formatRows, zoneRows, leadMagnets, topHooks, weeklyComparison })}
            className="text-xs px-3 py-1.5 border border-neutral-200 rounded hover:bg-neutral-50"
            title="Descargar como CSV"
          >
            📄 CSV
          </button>
          <button
            onClick={() => window.print()}
            className="text-xs px-3 py-1.5 border border-neutral-200 rounded hover:bg-neutral-50"
            title="Imprimir o guardar como PDF"
          >
            🖨 PDF
          </button>
        </div>
      </header>

      {/* Filtros */}
      <section className="card mb-4">
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex bg-neutral-100 rounded-lg p-0.5">
            {[
              { v: "week", l: "Semana" },
              { v: "month", l: "Mes" },
              { v: "quarter", l: "3 meses" },
              { v: "custom", l: "📅 Personalizado" },
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => setRange(opt.v)}
                className={`px-3 py-1 text-xs rounded-md ${range === opt.v ? "bg-white shadow-sm font-medium" : "text-neutral-600 hover:text-neutral-900"}`}
              >
                {opt.l}
              </button>
            ))}
          </div>

          <div>
            <label className="text-[10px] uppercase text-neutral-500 block mb-1">Zona</label>
            <select className="input text-xs w-auto" value={zoneFilter} onChange={(e) => navigate({ zone: e.target.value })}>
              <option value="all">Todas</option>
              {BODY_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase text-neutral-500 block mb-1">Tipo semana</label>
            <select className="input text-xs w-auto" value={typeFilter} onChange={(e) => navigate({ type: e.target.value })}>
              <option value="all">Todas</option>
              {WEEK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {(zoneFilter !== "all" || typeFilter !== "all" || formatsFilter.length > 0) && (
            <button onClick={() => navigate({ zone: "all", type: "all", formats: "" })} className="text-xs text-neutral-500 underline">
              Limpiar filtros
            </button>
          )}
        </div>

        {showCustom && (
          <div className="mt-3 pt-3 border-t border-neutral-100 flex gap-2 items-end">
            <div>
              <label className="text-[10px] uppercase text-neutral-500 block mb-1">Desde</label>
              <input type="date" className="input text-xs w-auto" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] uppercase text-neutral-500 block mb-1">Hasta</label>
              <input type="date" className="input text-xs w-auto" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
            <button onClick={applyCustom} disabled={!customFrom || !customTo} className="btn btn-primary text-xs">Aplicar</button>
          </div>
        )}

        {/* Multi-select formatos */}
        <div className="mt-3 pt-3 border-t border-neutral-100">
          <div className="text-[10px] uppercase text-neutral-500 mb-1">Formatos</div>
          <div className="flex gap-1 flex-wrap">
            {Object.entries(FORMAT_TEMPLATES).map(([k, v]) => {
              const active = formatsFilter.includes(k);
              return (
                <button
                  key={k}
                  onClick={() => toggleFormat(k)}
                  className={`text-[11px] px-2 py-1 rounded border ${active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50"}`}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <KpiCard label="Alcance" value={totals.reach} delta={deltas.reach} />
        <KpiCard label="Guardados" value={totals.saves} delta={deltas.saves} />
        <KpiCard label="Compartidos" value={totals.shares} delta={deltas.shares} />
        <KpiCard label="Comentarios" value={totals.comments} delta={deltas.comments} />
        <KpiCard label="DMs clave" value={totals.dmKeyword} delta={deltas.dmKeyword} accent />
        <KpiCard label="Ventas" value={totals.conversions} delta={deltas.conversions} accent />
      </div>

      {/* Rendimiento por formato */}
      <Section title="📦 Rendimiento por formato">
        {formatRows.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                  <th className="text-left py-2 px-2 font-medium">Formato</th>
                  <th className="text-right py-2 px-2 font-medium">N</th>
                  <th className="text-right py-2 px-2 font-medium">Ø Alcance</th>
                  <th className="text-right py-2 px-2 font-medium">Ø Guardados</th>
                  <th className="text-right py-2 px-2 font-medium">Ø Coment.</th>
                  <th className="text-right py-2 px-2 font-medium">Ø DMs</th>
                  <th className="text-right py-2 px-2 font-medium">Ø Ventas</th>
                </tr>
              </thead>
              <tbody>
                {formatRows.map((r) => (
                  <tr key={r.format} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-2 font-medium">{FORMAT_TEMPLATES[r.format as FormatKey]?.label ?? r.format}</td>
                    <td className="text-right py-2 px-2 text-neutral-500">{r.count}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{r.avgReach.toLocaleString("es-ES")}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{r.avgSaves}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{r.avgComments}</td>
                    <td className="text-right py-2 px-2 tabular-nums font-semibold">{r.avgDmKeyword}</td>
                    <td className="text-right py-2 px-2 tabular-nums text-emerald-700 font-medium">{r.avgConversions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Rendimiento por zona */}
      <Section title="🦴 Rendimiento por zona corporal">
        {zoneRows.length === 0 ? (
          <Empty />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {zoneRows.map((z) => {
              const label = BODY_ZONES.find((b) => b.value === z.zone)?.label ?? z.zone;
              return (
                <div key={z.zone} className="bg-neutral-50 rounded-lg p-3">
                  <div className="flex justify-between items-baseline mb-2">
                    <h3 className="font-semibold text-sm">{label}</h3>
                    <span className="text-[10px] text-neutral-500">{z.count} piezas</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Stat label="Ø Alcance" value={z.avgReach.toLocaleString("es-ES")} />
                    <Stat label="Ø Guardados" value={z.avgSaves} />
                    <Stat label="DMs total" value={z.totalDmKeyword} accent />
                    <Stat label="Ventas total" value={z.totalConversions} accent />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Lead magnets activos */}
      <Section title="🧲 Lead magnets activos">
        {leadMagnets.length === 0 ? (
          <Empty>No hay lead magnets registrados todavía. Ve al banco para añadir.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                  <th className="text-left py-2 px-2 font-medium">Lead magnet</th>
                  <th className="text-left py-2 px-2 font-medium">Palabra clave</th>
                  <th className="text-left py-2 px-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {leadMagnets.map((lm) => (
                  <tr key={lm.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-2 font-medium">{lm.name}</td>
                    <td className="py-2 px-2">{lm.keyword ? <span className="text-[10px] font-mono uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded">{lm.keyword}</span> : <span className="text-neutral-300">—</span>}</td>
                    <td className="py-2 px-2">
                      <span className={`text-[10px] uppercase px-2 py-0.5 rounded ${lm.active ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-500"}`}>
                        {lm.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Hooks ganadores del período */}
      <Section title="⚡ Hooks ganadores del período">
        {topHooks.length === 0 ? (
          <Empty>No hay piezas con hook + métricas en este período.</Empty>
        ) : (
          <div className="space-y-2">
            {topHooks.map((h, idx) => (
              <Link key={h.pieceId} href={`/fisio/contenido/pieza/${h.pieceId}`} className="block p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100">
                <div className="flex items-start gap-3">
                  <div className="text-2xl font-bold text-neutral-300 tabular-nums" style={{ minWidth: "2rem" }}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium mb-1">"{h.hook}"</p>
                    <div className="flex flex-wrap gap-3 text-xs text-neutral-500">
                      <span>{FORMAT_TEMPLATES[h.format as FormatKey]?.label ?? h.format}</span>
                      <span>· {h.weekTheme}</span>
                      {h.reach != null && <span>👀 {h.reach.toLocaleString("es-ES")}</span>}
                      {h.saves != null && <span>🔖 {h.saves}</span>}
                      {h.dmKeyword != null && <span className="text-amber-700 font-semibold">💬 {h.dmKeyword} DMs</span>}
                      {h.conversions != null && h.conversions > 0 && <span className="text-emerald-700 font-semibold">💰 {h.conversions}</span>}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* Comparativa semana a semana */}
      <Section title="📊 Comparativa semana a semana">
        {weeklyComparison.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                  <th className="text-left py-2 px-2 font-medium">Semana</th>
                  <th className="text-left py-2 px-2 font-medium">Tema</th>
                  <th className="text-left py-2 px-2 font-medium">Tipo</th>
                  <th className="text-left py-2 px-2 font-medium">KPI</th>
                  <th className="text-right py-2 px-2 font-medium">Real / Objetivo</th>
                  <th className="text-left py-2 px-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {weeklyComparison.map((w) => {
                  const typeLabel = WEEK_TYPES.find((t) => t.value === w.weekType)?.label ?? w.weekType;
                  const color =
                    w.kpiStatus === "above" || w.kpiStatus === "met" ? "bg-emerald-50 border-l-4 border-emerald-500"
                    : w.kpiStatus === "below" ? "bg-red-50 border-l-4 border-red-500"
                    : "";
                  return (
                    <tr key={w.id} className={`border-b border-neutral-100 hover:bg-neutral-50 ${color}`}>
                      <td className="py-2 px-2">
                        <Link href={`/fisio/contenido?week=${w.id}`} className="font-medium hover:underline">{w.label}</Link>
                      </td>
                      <td className="py-2 px-2">{w.theme}</td>
                      <td className="py-2 px-2 text-xs">{typeLabel}</td>
                      <td className="py-2 px-2 text-xs text-neutral-600">{w.kpiName || <span className="text-neutral-300">—</span>}</td>
                      <td className="text-right py-2 px-2 tabular-nums">
                        {w.kpiActual ?? "—"} <span className="text-neutral-400">/ {w.kpiTarget ?? "—"}</span>
                      </td>
                      <td className="py-2 px-2">
                        {w.kpiStatus === "above" && <span className="text-[10px] uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">🚀 Superado</span>}
                        {w.kpiStatus === "met" && <span className="text-[10px] uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">✓ Conseguido</span>}
                        {w.kpiStatus === "below" && <span className="text-[10px] uppercase bg-red-100 text-red-800 px-2 py-0.5 rounded">↓ Por debajo</span>}
                        {w.kpiStatus === "unknown" && <span className="text-[10px] uppercase bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="text-[11px] text-neutral-500 italic mt-4 text-center">
        💡 Exportar PDF / CSV llegará más adelante. Por ahora puedes usar la captura del navegador.
      </p>
    </>
  );
}

function KpiCard({ label, value, delta, accent }: { label: string; value: number; delta: number | null; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${accent ? "bg-amber-50 border border-amber-200" : "bg-neutral-50"}`}>
      <div className="text-[10px] uppercase text-neutral-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${accent ? "brand-gradient-text" : "text-neutral-900"}`}>
        {value.toLocaleString("es-ES")}
      </div>
      {delta != null && (
        <div className={`text-[10px] mt-0.5 ${delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-700" : "text-neutral-400"}`}>
          {delta > 0 ? "+" : ""}{delta}% vs período anterior
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card mb-4">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children?: React.ReactNode }) {
  return (
    <p className="text-sm text-neutral-400 italic text-center py-6">
      {children ?? "Sin datos en este período."}
    </p>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-neutral-500">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${accent ? "text-amber-800" : ""}`}>{value}</div>
    </div>
  );
}

// ============================================================================
// Export CSV
// ============================================================================

function exportCsv({
  rangeLabel,
  totals,
  formatRows,
  zoneRows,
  leadMagnets,
  topHooks,
  weeklyComparison,
}: {
  rangeLabel: string;
  totals: Totals;
  formatRows: FormatRow[];
  zoneRows: ZoneRow[];
  leadMagnets: LmRow[];
  topHooks: TopHook[];
  weeklyComparison: WeeklyRow[];
}) {
  const lines: string[] = [];

  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const row = (...cells: any[]) => lines.push(cells.map(escape).join(","));

  // Cabecera global
  row(`Métricas de contenido — ${rangeLabel}`);
  row("");

  // KPIs
  row("KPIs totales");
  row("Métrica", "Valor");
  row("Alcance", totals.reach);
  row("Guardados", totals.saves);
  row("Compartidos", totals.shares);
  row("Comentarios", totals.comments);
  row("DMs palabra clave", totals.dmKeyword);
  row("Ventas", totals.conversions);
  row("");

  // Formatos
  row("Rendimiento por formato");
  row("Formato", "N piezas", "Ø Alcance", "Ø Guardados", "Ø Comentarios", "Ø DMs", "Ø Ventas");
  for (const r of formatRows) {
    row(
      FORMAT_TEMPLATES[r.format as FormatKey]?.label ?? r.format,
      r.count, r.avgReach, r.avgSaves, r.avgComments, r.avgDmKeyword, r.avgConversions
    );
  }
  row("");

  // Zonas
  row("Rendimiento por zona corporal");
  row("Zona", "N piezas", "Ø Alcance", "Ø Guardados", "DMs total", "Ventas total");
  for (const z of zoneRows) {
    const label = BODY_ZONES.find((b) => b.value === z.zone)?.label ?? z.zone;
    row(label, z.count, z.avgReach, z.avgSaves, z.totalDmKeyword, z.totalConversions);
  }
  row("");

  // Lead magnets
  row("Lead magnets");
  row("Nombre", "Palabra clave", "Estado");
  for (const lm of leadMagnets) {
    row(lm.name, lm.keyword ?? "", lm.active ? "Activo" : "Inactivo");
  }
  row("");

  // Hooks ganadores
  row("Hooks ganadores del período");
  row("Rank", "Hook", "Formato", "Zona", "Tema semana", "Alcance", "Guardados", "DMs", "Ventas", "Score");
  topHooks.forEach((h, idx) => {
    row(
      idx + 1, h.hook,
      FORMAT_TEMPLATES[h.format as FormatKey]?.label ?? h.format,
      BODY_ZONES.find((b) => b.value === h.bodyZone)?.label ?? h.bodyZone,
      h.weekTheme,
      h.reach ?? "", h.saves ?? "", h.dmKeyword ?? "", h.conversions ?? "",
      h.score
    );
  });
  row("");

  // Comparativa semanal
  row("Comparativa semana a semana");
  row("Semana", "Tema", "Tipo", "KPI", "Real", "Objetivo", "Estado");
  for (const w of weeklyComparison) {
    const typeLabel = WEEK_TYPES.find((t) => t.value === w.weekType)?.label ?? w.weekType;
    const statusLabel = w.kpiStatus === "above" ? "Superado" : w.kpiStatus === "met" ? "Conseguido" : w.kpiStatus === "below" ? "Por debajo" : "—";
    row(w.label, w.theme, typeLabel, w.kpiName ?? "", w.kpiActual ?? "", w.kpiTarget ?? "", statusLabel);
  }

  const csv = "\uFEFF" + lines.join("\n"); // BOM para Excel
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `metricas-${rangeLabel.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
