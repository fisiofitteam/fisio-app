"use client";

import { useState } from "react";
import { CapacityCell } from "@/components/CapacityCell";
import { OpsSettingsPanel } from "@/components/OpsSettingsPanel";
import type { CapacityReport as CapacityReportData } from "@/lib/capacity";

/**
 * Panel de capacidad operativa. Muestra:
 *   - Tarjetas resumen (globales).
 *   - Tabla por coach con capacidad editable inline.
 *   - Sección de pacientes en pausa.
 *
 * Sin etiquetas verbales para el estado — solo COLORES según los
 * umbrales que vienen de OpsConfig. Verde=ok, ámbar=al límite, rojo=
 * saturado / déficit.
 */

const COLOR_RED = "#DC2626";
const COLOR_AMBER = "#B45309";
const COLOR_GREEN = "#059669";
const COLOR_NEUTRAL = "#171717";

function occColor(occ: number, warn: number, crit: number): string {
  if (occ >= crit) return COLOR_RED;
  if (occ >= warn) return COLOR_AMBER;
  return COLOR_NEUTRAL;
}

function rateColor(rate: number | null, warn: number, crit: number): string {
  if (rate == null) return COLOR_NEUTRAL;
  if (rate >= warn) return COLOR_GREEN;
  if (rate >= crit) return COLOR_AMBER;
  return COLOR_RED;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });
}

function roleBadge(role: string): { label: string; bg: string; fg: string } {
  if (role === "head_success") return { label: "Head coach", bg: "#EDE9FE", fg: "#5B21B6" };
  return { label: "Fisio", bg: "#E0E7FF", fg: "#3730A3" };
}

export function CapacityReport({
  data,
  embedded = false,
}: {
  data: CapacityReportData;
  embedded?: boolean;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const { config, summary, coaches, pausedPatients } = data;

  return (
    <div className={embedded ? "" : "max-w-6xl mx-auto"}>
      {!embedded && (
        <header className="mb-5 flex justify-between items-end flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-semibold">🧭 Capacidad operativa</h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              Cuánta carga llevas y cuántos huecos vas a tener próximamente. Base:
              {" "}
              <b>{config.occupancyBasis === "active" ? "solo activos" : "todos los asignados"}</b>.
            </p>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ background: "#F5F5F5", color: "#171717" }}
          >
            ⚙️ Ajustes
          </button>
        </header>
      )}

      {embedded && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => setShowSettings(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ background: "#F5F5F5", color: "#171717" }}
          >
            ⚙️ Ajustes
          </button>
        </div>
      )}

      {/* ── Resumen ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
        <SumTile label="Coaches" value={summary.coaches} />
        <SumTile label="Asignadas" value={summary.assigned} />
        <SumTile label="Activas" value={summary.active} />
        <SumTile label="En pausa" value={summary.paused} />
        <SumTile label="Capacidad total" value={summary.capacityTotal} />
        <SumTile
          label="Huecos libres"
          value={summary.freeTotal}
          color={summary.freeTotal <= 0 ? COLOR_RED : COLOR_NEUTRAL}
        />
        <SumTile label="Renov. previstas" value={summary.expectedRenewTotal} />
      </div>

      {/* Mini widget de coaches saturados */}
      {summary.saturatedCoaches > 0 && (
        <div
          className="rounded-lg p-3 text-xs mb-4"
          style={{ background: "#FEE2E2", color: "#7F1D1D", border: "1px solid #FCA5A5" }}
        >
          🔴 <b>{summary.saturatedCoaches}</b> coach{summary.saturatedCoaches === 1 ? "" : "es"} con ocupación ≥ {config.occupancyCrit}% — revisa reasignaciones antes de cerrar altas nuevas.
        </div>
      )}

      {/* ── Tabla por coach ─────────────────────────────────────────── */}
      <section className="card mb-5">
        <h2 className="font-medium text-sm mb-2">Por coach</h2>
        <p className="text-[11px] text-neutral-500 mb-2">
          Capacidad editable inline. "Renov. previstas" = "Renuevan {config.expectedRenewDays}d" × tasa histórica ({config.renewalHistoryMonths}m). "~" marca fallback al equipo.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                <th className="text-left py-2 px-2 font-medium">Coach</th>
                <th className="text-right py-2 px-2 font-medium">Asignadas</th>
                <th className="text-right py-2 px-2 font-medium">Activas</th>
                <th className="text-right py-2 px-2 font-medium">En pausa</th>
                <th className="text-right py-2 px-2 font-medium">Capacidad</th>
                <th className="text-right py-2 px-2 font-medium">Ocupación</th>
                <th className="text-right py-2 px-2 font-medium" title={`Endan en <=${config.expectedRenewDays}d`}>Renuevan {config.expectedRenewDays}d</th>
                <th className="text-right py-2 px-2 font-medium" title={`Últimos ${config.renewalHistoryMonths}m`}>Tasa {config.renewalHistoryMonths}m</th>
                <th className="text-right py-2 px-2 font-medium">Renov. prev.</th>
                <th className="text-right py-2 px-2 font-medium">Huecos prev.</th>
              </tr>
            </thead>
            <tbody>
              {coaches.map((c) => {
                const badge = roleBadge(c.role);
                const oc = occColor(c.occupancy, config.occupancyWarn, config.occupancyCrit);
                const rc = rateColor(c.renewalRate, config.renewalRateWarn, config.renewalRateCrit);
                const pf = c.projectedFree;
                const pfColor = pf <= 0 ? COLOR_RED : COLOR_GREEN;
                return (
                  <tr key={c.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.fullName}</span>
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{ background: badge.bg, color: badge.fg }}
                        >
                          {badge.label}
                        </span>
                      </div>
                    </td>
                    <td className="text-right py-2 px-2 tabular-nums">{c.assigned}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{c.active}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{c.paused}</td>
                    <td className="text-right py-2 px-2">
                      <CapacityCell
                        professionalId={c.id}
                        effectiveCapacity={c.capacity}
                        hasOverride={c.maxPatientsOverride != null}
                        defaultCapacity={config.defaultMaxPatients}
                      />
                    </td>
                    <td className="text-right py-2 px-2 font-medium tabular-nums" style={{ color: oc }}>
                      {c.occupancy}%
                    </td>
                    <td className="text-right py-2 px-2 tabular-nums">{c.renewsSoon}</td>
                    <td className="text-right py-2 px-2 font-medium tabular-nums" style={{ color: rc }}>
                      {c.renewalRate != null ? `${c.renewalRate}%` : "—"}
                      {c.useTeamFallback && c.renewalRate != null && (
                        <span className="text-[10px] text-neutral-400 ml-0.5">~</span>
                      )}
                    </td>
                    <td className="text-right py-2 px-2 tabular-nums">{c.expectedRenew}</td>
                    <td className="text-right py-2 px-2 font-medium tabular-nums" style={{ color: pfColor }}>
                      {pf}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Pacientes en pausa ──────────────────────────────────────── */}
      <section className="card">
        <h2 className="font-medium text-sm mb-2">Pacientes en pausa · {pausedPatients.length}</h2>
        {pausedPatients.length === 0 ? (
          <p className="text-xs text-neutral-400 italic">Sin pausas activas ahora mismo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                  <th className="text-left py-2 px-2 font-medium">Paciente</th>
                  <th className="text-left py-2 px-2 font-medium">Coach</th>
                  <th className="text-left py-2 px-2 font-medium">Inicio</th>
                  <th className="text-left py-2 px-2 font-medium">Vuelve</th>
                  <th className="text-right py-2 px-2 font-medium">Días restantes</th>
                </tr>
              </thead>
              <tbody>
                {pausedPatients.map((p) => (
                  <tr key={p.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-2">
                      <a href={`/fisio/paciente/${p.id}`} className="font-medium text-neutral-900 hover:underline">
                        {p.fullName}
                      </a>
                    </td>
                    <td className="py-2 px-2 text-neutral-700">{p.coachName ?? "—"}</td>
                    <td className="py-2 px-2 text-neutral-700">{formatDate(p.pauseStart)}</td>
                    <td className="py-2 px-2 text-neutral-700">{formatDate(p.pauseEnd)}</td>
                    <td className="text-right py-2 px-2 tabular-nums">
                      <span style={{ color: p.daysLeft <= 3 ? COLOR_AMBER : COLOR_NEUTRAL }}>
                        {p.daysLeft}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showSettings && (
        <OpsSettingsPanel initial={config} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function SumTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-neutral-50 rounded-lg p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-2xl font-semibold tabular-nums" style={{ color: color ?? COLOR_NEUTRAL }}>
        {value}
      </div>
    </div>
  );
}
