"use client";

import { useEffect, useMemo, useState } from "react";
import { AutotestConfigCard } from "./AutotestConfigCard";
import { ARQUETIPOS } from "@/lib/autotest-hombro/arquetipos";
import { AREAS, levelFromScore } from "@/lib/autotest-hombro/areas";

/**
 * Panel interno del Autotest Funcional del Hombro. Muestra:
 *   - Config (vídeos + copy WhatsApp).
 *   - Filtros (fechas + arquetipo + estado + search).
 *   - KPIs (iniciados, completados, %, CTR WhatsApp).
 *   - Tabla con las respuestas y detalle inline expandible.
 *
 * Similar en espíritu a SemaforoPanel pero más contenido — este lead
 * magnet no tiene todavía embudo de alarmas ni gestión en lote.
 */

type Row = {
  id: string;
  createdAt: string;
  instagram: string | null;
  nombre: string | null;
  telefono: string | null;
  campana: string | null;
  estado: "EN_CURSO" | "COMPLETADO";
  ultimoPaso: number;
  arquetipo: string | null;
  scores: Record<string, number> | null;
  whatsappClickAt: string | null;
  gestionado: boolean;
  gestionadoPor: string | null;
};

type Kpis = {
  iniciados: number;
  completados: number;
  enCurso: number;
  pctCompletado: number;
  arquetipoCount: Record<string, number>;
  ctrTotal: { total: number; clicks: number; pct: number };
  abandono: { step: number; title: string; count: number }[];
};

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

export function AutotestPanel({ canDelete, embedded = false }: { canDelete: boolean; embedded?: boolean }) {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoToday());
  const [arquetipo, setArquetipo] = useState("");
  const [estado, setEstado] = useState<"" | "EN_CURSO" | "COMPLETADO">("");
  const [whatsapp, setWhatsapp] = useState<"" | "1" | "0">("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (arquetipo) p.set("arquetipo", arquetipo);
    if (estado) p.set("estado", estado);
    if (whatsapp) p.set("whatsapp", whatsapp);
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  }, [from, to, arquetipo, estado, whatsapp, q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/autotest-hombro/admin/list?" + queryString)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) { setError(d?.error ?? "Error"); return; }
        setRows(d.rows ?? []);
        setKpis(d.kpis ?? null);
      })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [queryString]);

  function downloadCsv() {
    window.location.href = "/api/autotest-hombro/admin/list?" + queryString + "&format=csv";
  }

  async function delRow(id: string) {
    if (!confirm("Eliminar este registro? No se puede deshacer.")) return;
    setDeleting(id);
    try {
      const r = await fetch(`/api/autotest-hombro/admin/${id}`, { method: "DELETE" });
      if (!r.ok) {
        alert("No se pudo eliminar");
      } else {
        setRows((prev) => prev.filter((x) => x.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  }

  const Wrap = embedded ? "div" : "main";
  const wrapClass = embedded ? "" : "p-4 md:p-6 max-w-[1400px] mx-auto";

  return (
    <Wrap className={wrapClass}>
      <header className="flex justify-between items-end gap-2 flex-wrap mb-4">
        <div>
          <h1 className="text-xl font-semibold">🧪 Autotest Funcional del Hombro</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Respuestas del test público, distribución de arquetipos y embudo.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/autotest-hombro"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ background: "#F5F5F5", color: "#171717", border: "1px solid #E5E5E5" }}
          >
            🔗 Abrir landing
          </a>
          <button
            onClick={downloadCsv}
            className="text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ background: "#F5F5F5", color: "#171717", border: "1px solid #E5E5E5" }}
          >
            ⬇ Export CSV
          </button>
        </div>
      </header>

      <AutotestConfigCard />

      {/* Filtros */}
      <section className="rounded-xl p-3 mb-4" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
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
            <span className="block text-neutral-500 mb-1">Arquetipo</span>
            <select value={arquetipo} onChange={(e) => setArquetipo(e.target.value)}
                    className="w-full px-2 py-1.5 rounded border" style={{ borderColor: "#E5E5E5" }}>
              <option value="">Todos</option>
              {ARQUETIPOS.map((a) => (
                <option key={a.id} value={a.id}>{a.emoji} {a.title}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-neutral-500 mb-1">Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value as any)}
                    className="w-full px-2 py-1.5 rounded border" style={{ borderColor: "#E5E5E5" }}>
              <option value="">Todos</option>
              <option value="EN_CURSO">En curso</option>
              <option value="COMPLETADO">Completado</option>
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
            <span className="block text-neutral-500 mb-1">Buscar</span>
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o IG"
                   className="w-full px-2 py-1.5 rounded border" style={{ borderColor: "#E5E5E5" }} />
          </label>
        </div>
      </section>

      {/* KPIs */}
      {kpis && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <KpiCell label="Iniciados" value={kpis.iniciados} />
          <KpiCell label="Completados" value={`${kpis.completados} · ${kpis.pctCompletado}%`} />
          <KpiCell label="En curso" value={kpis.enCurso} />
          <KpiCell label="CTR WhatsApp" value={`${kpis.ctrTotal.clicks} / ${kpis.ctrTotal.total} · ${kpis.ctrTotal.pct}%`} />
        </section>
      )}

      {/* Distribución arquetipos */}
      {kpis && kpis.completados > 0 && (
        <section className="rounded-xl p-3 mb-4" style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}>
          <h3 className="text-xs font-semibold mb-2 text-neutral-700">Distribución por arquetipo (completados)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {ARQUETIPOS.map((a) => {
              const n = kpis.arquetipoCount[a.id] ?? 0;
              const pct = kpis.completados > 0 ? Math.round((n / kpis.completados) * 100) : 0;
              return (
                <div key={a.id} className="rounded-lg px-2 py-1.5" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
                  <div className="text-[11px] text-neutral-500 leading-tight">{a.emoji} {a.title}</div>
                  <div className="text-sm font-semibold tabular-nums">{n} <span className="text-[11px] text-neutral-500">· {pct}%</span></div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Tabla */}
      <section className="rounded-xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}>
        <div className="px-3 py-2 text-xs text-neutral-500 border-b" style={{ borderColor: "#E5E5E5" }}>
          {loading ? "Cargando…" : error ? <span className="text-red-600">{error}</span> : `${rows.length} resultados`}
        </div>
        <div className="divide-y" style={{ borderColor: "#E5E5E5" }}>
          {rows.map((r) => (
            <RowItem
              key={r.id}
              r={r}
              expanded={expandedId === r.id}
              onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
              onDelete={canDelete ? () => delRow(r.id) : null}
              deleting={deleting === r.id}
            />
          ))}
          {rows.length === 0 && !loading && (
            <div className="px-3 py-6 text-center text-xs text-neutral-500 italic">
              Sin respuestas con los filtros actuales.
            </div>
          )}
        </div>
      </section>
    </Wrap>
  );
}

function KpiCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function RowItem({
  r, expanded, onToggle, onDelete, deleting,
}: {
  r: Row;
  expanded: boolean;
  onToggle: () => void;
  onDelete: (() => void) | null;
  deleting: boolean;
}) {
  const arqMeta = r.arquetipo ? ARQUETIPOS.find((a) => a.id === r.arquetipo) : null;
  return (
    <div>
      <button className="w-full text-left px-3 py-2.5 hover:bg-neutral-50 flex items-center gap-3" onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">
              {r.nombre || <span className="text-neutral-400 italic">sin nombre</span>}
            </span>
            {r.instagram && <span className="text-[11px] text-neutral-500">@{r.instagram}</span>}
            {r.whatsappClickAt && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "#DCFCE7", color: "#166534" }}>
                WA
              </span>
            )}
            {r.estado === "EN_CURSO" && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "#FEF3C7", color: "#92400E" }}>
                En curso · paso {r.ultimoPaso + 1}
              </span>
            )}
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            {fmtDate(r.createdAt)}
            {arqMeta && (
              <> · {arqMeta.emoji} {arqMeta.title}</>
            )}
          </div>
        </div>
        <span className="text-neutral-400">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 text-xs" style={{ background: "#FAFAFA" }}>
          {r.scores && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 mt-2">
              {AREAS.map((a) => {
                const s = r.scores![a.id] ?? 0;
                const level = levelFromScore(s);
                const color = level === "green" ? "#16A34A" : level === "amber" ? "#D97706" : "#DC2626";
                return (
                  <div key={a.id} className="rounded-md px-2 py-1 bg-white" style={{ border: "1px solid #E5E5E5" }}>
                    <div className="text-[10px] text-neutral-500">{a.emoji} {a.short}</div>
                    <div className="text-sm font-semibold tabular-nums" style={{ color }}>{s}</div>
                  </div>
                );
              })}
            </div>
          )}
          {r.telefono && <div className="mt-2 text-neutral-600">📞 {r.telefono}</div>}
          {r.campana && <div className="mt-1 text-neutral-500">campaña: <code>{r.campana}</code></div>}
          <div className="mt-2 flex gap-2">
            <a
              href={`/api/autotest-hombro/admin/${r.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] px-2 py-1 rounded border"
              style={{ borderColor: "#E5E5E5" }}
            >
              Ver detalle completo (JSON)
            </a>
            {onDelete && (
              <button
                onClick={onDelete}
                disabled={deleting}
                className="text-[11px] px-2 py-1 rounded"
                style={{ background: "#FEE2E2", color: "#991B1B", border: "1px solid #FCA5A5", opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? "Eliminando…" : "🗑 Eliminar"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
