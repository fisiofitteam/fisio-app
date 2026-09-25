"use client";

import { useEffect, useMemo, useState } from "react";
import { SemaforoDetailDrawer } from "./SemaforoDetailDrawer";
import { SemaforoLinkGenerator } from "./SemaforoLinkGenerator";
import { SemaforoConfigCard } from "./SemaforoConfigCard";

/**
 * Panel interno del Semáforo del Hombro. Un solo componente cliente:
 * carga list+kpis con los filtros activos, pinta KPIs / gráfico de
 * abandono / tabla / drawer detalle / botón export CSV / botón
 * "Generar enlace" y (para el CEO) botón eliminar.
 */

type Movimientos = Record<string, string> | null;

export type SemaforoRow = {
  id: string;
  createdAt: string;
  instagram: string | null;
  nombre: string | null;
  telefono: string | null;
  campana: string | null;
  estado: "EN_CURSO" | "COMPLETADO" | "ALARMA";
  ultimoPaso: number;
  color: "VERDE" | "AMBAR" | "ROJO" | null;
  banderas: string[];
  movimientos: Movimientos;
  whatsappClickAt: string | null;
  gestionado: boolean;
  gestionadoPor: string | null;
};

type Kpis = {
  iniciados: number;
  completados: number;
  enCurso: number;
  alarmas: number;
  pctCompletado: number;
  colorCount: { VERDE: number; AMBAR: number; ROJO: number };
  ctrByColor: Record<string, { total: number; clicks: number; pct: number }>;
  ctrAlarma: { total: number; clicks: number; pct: number };
  abandono: { step: number; title: string; count: number }[];
};

// ISO YYYY-MM-DD de fechas defaults: últimos 30 días.
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const COLORS = {
  VERDE: { bg: "#DCFCE7", fg: "#166534" },
  AMBAR: { bg: "#FEF3C7", fg: "#92400E" },
  ROJO: { bg: "#FEE2E2", fg: "#991B1B" },
  ALARMA: { bg: "#111827", fg: "#FEE2E2" },
} as const;

export function SemaforoPanel({
  canDelete, legalRevisado, igParamName, campaignParamName, embedded = false,
}: {
  canDelete: boolean;
  legalRevisado: boolean;
  igParamName: string;
  campaignParamName: string;
  /** true si va montado dentro de otra página con su propio layout;
   *  omite el <main> con padding para no doblarlo. */
  embedded?: boolean;
}) {
  // ─── Filtros ─────────────────────────────────────────────────
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoToday());
  const [color, setColor] = useState<"" | "VERDE" | "AMBAR" | "ROJO">("");
  const [estado, setEstado] = useState<"" | "EN_CURSO" | "COMPLETADO" | "ALARMA">("");
  const [whatsapp, setWhatsapp] = useState<"" | "1" | "0">("");
  const [gestionado, setGestionado] = useState<"" | "1" | "0">("");
  const [campana, setCampana] = useState("");
  const [q, setQ] = useState("");
  const [showLinkGen, setShowLinkGen] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  // ─── Data ───────────────────────────────────────────────────
  const [rows, setRows] = useState<SemaforoRow[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ─── Config del lead magnet ────────────────────────────────
  // Se usa para decidir si mostrar la columna "WA" en la tabla — en
  // modo funnel es la única señal que le queda al equipo para saber
  // si el lead ha respondido; fuera de funnel, no aporta valor.
  const [funnelMode, setFunnelMode] = useState(false);
  useEffect(() => {
    fetch("/api/semaforo/admin/config")
      .then((r) => r.json())
      .then((d) => { if (d?.ok && d.config) setFunnelMode(!!d.config.quizFunnelEnabled); })
      .catch(() => {});
  }, []);
  // ─── Selección múltiple para borrado en lote (solo CEO) ─────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll(currentIds: string[]) {
    setSelected((prev) => {
      // Si todos están seleccionados, deselecciona todos. Si no, selecciona todos.
      const allSelected = currentIds.length > 0 && currentIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(currentIds);
    });
  }

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (color) p.set("color", color);
    if (estado) p.set("estado", estado);
    if (whatsapp) p.set("whatsapp", whatsapp);
    if (gestionado) p.set("gestionado", gestionado);
    if (campana.trim()) p.set("campana", campana.trim());
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  }, [from, to, color, estado, whatsapp, gestionado, campana, q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/semaforo/admin/list?" + queryString)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) { setError(d?.error ?? "Error"); return; }
        setRows(d.rows);
        setKpis(d.kpis);
      })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [queryString]);

  function downloadCsv() {
    window.location.href = "/api/semaforo/admin/list?" + queryString + "&format=csv";
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Eliminar ${ids.length} registro${ids.length === 1 ? "" : "s"}? No se puede deshacer.`)) return;
    setDeleting(true);
    try {
      // Borrado paralelo. Si alguno falla, seguimos con los demás y avisamos.
      const results = await Promise.allSettled(
        ids.map((id) => fetch(`/api/semaforo/admin/${id}`, { method: "DELETE" })),
      );
      const failures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok));
      if (failures.length > 0) {
        alert(`Se eliminaron ${ids.length - failures.length} de ${ids.length}. ${failures.length} fallaron.`);
      }
      setSelected(new Set());
      const res = await fetch("/api/semaforo/admin/list?" + queryString);
      const data = await res.json();
      setRows(data.rows);
      setKpis(data.kpis);
    } finally {
      setDeleting(false);
    }
  }

  const maxAbandono = kpis ? Math.max(1, ...kpis.abandono.map((a) => a.count)) : 1;

  const Wrap = embedded ? "div" : "main";
  const wrapClass = embedded ? "" : "p-4 md:p-6 max-w-[1400px] mx-auto";

  return (
    <Wrap className={wrapClass}>
      <header className="flex justify-between items-end gap-2 flex-wrap mb-4">
        <div>
          <h1 className="text-xl font-semibold">🚦 Semáforo del Hombro</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Respuestas del test público, embudo y gestión de leads.
          </p>
        </div>
        <div className="flex gap-2">
          {canDelete && selected.size > 0 && (
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60"
              style={{ background: "#DC2626", color: "white", border: "1px solid #B91C1C" }}
              title="Eliminar los registros seleccionados (irreversible)"
            >
              {deleting ? "Eliminando…" : `🗑 Eliminar ${selected.size}`}
            </button>
          )}
          <button
            onClick={() => setShowLinkGen(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ background: "#F5F5F5", color: "#171717", border: "1px solid #E5E5E5" }}
          >
            🔗 Generar enlace
          </button>
          <button
            onClick={downloadCsv}
            className="text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ background: "#F5F5F5", color: "#171717", border: "1px solid #E5E5E5" }}
          >
            ⬇ Export CSV
          </button>
        </div>
      </header>

      {/* ── Configuración del lead magnet ─────────────────────────────── */}
      <SemaforoConfigCard />

      {/* ── Filtros ─────────────────────────────────────────────────── */}
      <section className="rounded-xl p-3 mb-4" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">Desde</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                   className="w-full px-2 py-1.5 rounded border" style={{ borderColor: "#E5E5E5" }} />
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">Hasta</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                   className="w-full px-2 py-1.5 rounded border" style={{ borderColor: "#E5E5E5" }} />
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">Color</span>
            <select value={color} onChange={(e) => setColor(e.target.value as any)}
                    className="w-full px-2 py-1.5 rounded border" style={{ borderColor: "#E5E5E5" }}>
              <option value="">Todos</option>
              <option value="VERDE">Verde</option>
              <option value="AMBAR">Ámbar</option>
              <option value="ROJO">Rojo</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value as any)}
                    className="w-full px-2 py-1.5 rounded border" style={{ borderColor: "#E5E5E5" }}>
              <option value="">Todos</option>
              <option value="EN_CURSO">En curso</option>
              <option value="COMPLETADO">Completado</option>
              <option value="ALARMA">Alarma</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">WhatsApp</span>
            <select value={whatsapp} onChange={(e) => setWhatsapp(e.target.value as any)}
                    className="w-full px-2 py-1.5 rounded border" style={{ borderColor: "#E5E5E5" }}>
              <option value="">Todos</option>
              <option value="1">Con click</option>
              <option value="0">Sin click</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">Gestión</span>
            <select value={gestionado} onChange={(e) => setGestionado(e.target.value as any)}
                    className="w-full px-2 py-1.5 rounded border" style={{ borderColor: "#E5E5E5" }}>
              <option value="">Todos</option>
              <option value="1">Gestionados</option>
              <option value="0">Pendientes</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">Campaña</span>
            <input type="text" value={campana} onChange={(e) => setCampana(e.target.value)}
                   placeholder="reel-hombro…"
                   className="w-full px-2 py-1.5 rounded border" style={{ borderColor: "#E5E5E5" }} />
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">Buscar</span>
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="@ o nombre"
                   className="w-full px-2 py-1.5 rounded border" style={{ borderColor: "#E5E5E5" }} />
          </label>
        </div>
      </section>

      {/* ── KPIs ────────────────────────────────────────────────────── */}
      {kpis && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-3">
            <Tile label="Iniciados" value={kpis.iniciados} />
            <Tile label="Completados" value={kpis.completados} />
            <Tile label="% completado" value={`${kpis.pctCompletado}%`} />
            <Tile label="En curso" value={kpis.enCurso} />
            <Tile label="Alarmas" value={kpis.alarmas} color={kpis.alarmas > 0 ? "#DC2626" : undefined} />
            <Tile label="Verde / Ámbar / Rojo"
              value={`${kpis.colorCount.VERDE} · ${kpis.colorCount.AMBAR} · ${kpis.colorCount.ROJO}`} />
            <Tile label="CTR WhatsApp (rojo)"
              value={`${kpis.ctrByColor.ROJO?.pct ?? 0}%`}
              hint={`${kpis.ctrByColor.ROJO?.clicks ?? 0}/${kpis.ctrByColor.ROJO?.total ?? 0}`} />
          </div>

          {/* CTR por color en detalle */}
          <div className="rounded-xl p-3 mb-4" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
            <div className="text-xs text-neutral-500 mb-2">CTR de WhatsApp por color</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <CtrBar label="Verde" data={kpis.ctrByColor.VERDE} color="#059669" />
              <CtrBar label="Ámbar" data={kpis.ctrByColor.AMBAR} color="#B45309" />
              <CtrBar label="Rojo" data={kpis.ctrByColor.ROJO} color="#DC2626" />
              <CtrBar label="Alarma" data={kpis.ctrAlarma} color="#111827" />
            </div>
          </div>

          {/* Gráfico de abandono */}
          <div className="rounded-xl p-3 mb-4" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
            <div className="text-xs text-neutral-500 mb-2">
              Abandono por paso · {kpis.abandono.reduce((n, a) => n + a.count, 0)} respuestas en EN_CURSO
            </div>
            <div className="space-y-1">
              {kpis.abandono.map((a) => (
                <div key={a.step} className="flex items-center gap-2 text-xs">
                  <span className="w-6 text-right text-neutral-500 tabular-nums">{a.step + 1}</span>
                  <span className="flex-1 truncate" title={a.title}>{a.title}</span>
                  <div className="w-40 h-3 rounded" style={{ background: "#E5E5E5" }}>
                    <div className="h-full rounded"
                      style={{
                        width: `${(a.count / maxAbandono) * 100}%`,
                        background: a.count > 0 ? "#DC2626" : "transparent",
                      }} />
                  </div>
                  <span className="w-8 text-right tabular-nums font-medium">{a.count}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Tabla ────────────────────────────────────────────────────── */}
      <section className="rounded-xl overflow-hidden" style={{ background: "white", border: "1px solid #E5E5E5" }}>
        {loading ? (
          <p className="p-6 text-sm text-neutral-500 italic text-center">Cargando…</p>
        ) : error ? (
          <p className="p-6 text-sm text-red-600 text-center">{error}</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-sm text-neutral-400 italic text-center">Sin resultados en el rango seleccionado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-[11px] text-neutral-500 uppercase border-b border-neutral-200 bg-neutral-50">
                  {canDelete && (
                    <th className="text-center py-2 px-2 font-medium w-8">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                        onChange={() => toggleSelectAll(rows.map((r) => r.id))}
                        className="h-3.5 w-3.5 accent-red-600 cursor-pointer"
                        title="Seleccionar todos los visibles"
                      />
                    </th>
                  )}
                  <th className="text-left py-2 px-2 font-medium">Fecha</th>
                  <th className="text-left py-2 px-2 font-medium">@Instagram</th>
                  <th className="text-left py-2 px-2 font-medium">Nombre</th>
                  <th className="text-left py-2 px-2 font-medium">Estado / Color</th>
                  {funnelMode && <th className="text-center py-2 px-2 font-medium">WA</th>}
                  <th className="text-center py-2 px-2 font-medium">Gest.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}
                      className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer"
                      onClick={() => setDrawerId(r.id)}>
                    {canDelete && (
                      <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelected(r.id)}
                          className="h-3.5 w-3.5 accent-red-600 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="py-2 px-2 whitespace-nowrap text-neutral-700">{fmtDate(r.createdAt)}</td>
                    <td className="py-2 px-2">
                      {r.instagram ? (
                        <a
                          href={`https://instagram.com/${r.instagram}`}
                          target="_blank" rel="noopener"
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-700 hover:underline"
                        >@{r.instagram}</a>
                      ) : <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="py-2 px-2">{r.nombre || <span className="text-neutral-400">—</span>}</td>
                    <td className="py-2 px-2">
                      <StatusChip row={r} />
                    </td>
                    {funnelMode && (
                      <td className="py-2 px-2 text-center">
                        {r.whatsappClickAt ? <span title={fmtDate(r.whatsappClickAt)}>✅</span> : <span className="text-neutral-400">—</span>}
                      </td>
                    )}
                    <td className="py-2 px-2 text-center">
                      {r.gestionado
                        ? <span title={r.gestionadoPor ?? ""}>✔</span>
                        : <span className="text-neutral-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {drawerId && (
        <SemaforoDetailDrawer
          id={drawerId}
          canDelete={canDelete}
          onClose={() => setDrawerId(null)}
          onChanged={() => {
            // Recargar list con los filtros vigentes.
            fetch("/api/semaforo/admin/list?" + queryString)
              .then((r) => r.json())
              .then((d) => { setRows(d.rows); setKpis(d.kpis); })
              .catch(() => {});
          }}
        />
      )}

      {showLinkGen && (
        <SemaforoLinkGenerator
          igParamName={igParamName}
          campaignParamName={campaignParamName}
          onClose={() => setShowLinkGen(false)}
        />
      )}
    </Wrap>
  );
}

// ── Sub-componentes de presentación ─────────────────────────────────

function Tile({ label, value, hint, color }: { label: string; value: string | number; hint?: string; color?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className="text-xl font-semibold tabular-nums" style={{ color: color ?? "#171717" }}>{value}</div>
      {hint && <div className="text-[10px] text-neutral-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function CtrBar({ label, data, color }: { label: string; data: { total: number; clicks: number; pct: number }; color: string }) {
  return (
    <div className="rounded-lg p-2.5 bg-white" style={{ border: "1px solid #E5E5E5" }}>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums" style={{ color }}>{data.pct}%</span>
      </div>
      <div className="h-2 rounded" style={{ background: "#E5E5E5" }}>
        <div className="h-full rounded" style={{ width: `${data.pct}%`, background: color }} />
      </div>
      <div className="text-[10px] text-neutral-500 mt-1">{data.clicks}/{data.total} clicks</div>
    </div>
  );
}

function StatusChip({ row }: { row: SemaforoRow }) {
  if (row.estado === "ALARMA") {
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
      style={{ background: COLORS.ALARMA.bg, color: COLORS.ALARMA.fg }}>🚨 ALARMA</span>;
  }
  if (row.estado === "EN_CURSO") {
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-700">
      En paso {row.ultimoPaso + 1}
    </span>;
  }
  if (row.color) {
    const c = COLORS[row.color];
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
      style={{ background: c.bg, color: c.fg }}>{row.color}</span>;
  }
  return <span className="text-neutral-400 text-xs">—</span>;
}

function MovDots({ mov }: { mov: Movimientos }) {
  if (!mov) return <span className="text-neutral-400">—</span>;
  const dot = (v?: string) => {
    const c = v === "duele" ? "#DC2626" : v === "leve" ? "#B45309" : v === "ok" ? "#059669" : "#D4D4D4";
    return <span title={v ?? "—"} className="inline-block w-2.5 h-2.5 rounded-full mr-1" style={{ background: c }} />;
  };
  return (
    <span>
      {dot(mov.overhead)}{dot(mov.tirones)}{dot(mov.empujes)}
    </span>
  );
}
