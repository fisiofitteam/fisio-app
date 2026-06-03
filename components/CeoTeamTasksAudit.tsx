"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type AuditEntry = {
  professionalId: string;
  professionalName: string;
  role: string;
  weekStartIso: string;
  weekLabel: string;
  missingByDay: Array<{ dayOfWeek: number; dayLabel: string; tasks: string[] }>;
  missingTotal: number;
};

/**
 * Sección discreta para que el CEO vea qué tareas se ha dejado cada fisio /
 * head_success sin marcar (esta semana y la anterior). Por defecto está
 * colapsada — no la ven los demás.
 */
export function CeoTeamTasksAudit({ audit }: { audit: AuditEntry[] }) {
  const [open, setOpen] = useState(false);

  // Agrupar por semana
  const weeks = [...new Set(audit.map((e) => e.weekStartIso))];
  const totalMissing = audit.reduce((sum, e) => sum + e.missingTotal, 0);

  return (
    <section className="card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-baseline justify-between gap-3"
      >
        <div className="flex items-baseline gap-2">
          {open ? <EyeOff size={14} className="text-neutral-500" /> : <Eye size={14} className="text-neutral-500" />}
          <h2 className="font-medium text-sm">Auditoría de tareas (solo CEO)</h2>
          {!open && totalMissing > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#FEE2E2", color: "#7F1D1D" }}>
              {totalMissing} sin marcar
            </span>
          )}
        </div>
        <span className="text-xs text-neutral-400">{open ? "Ocultar" : "Mostrar"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          <p className="text-[11px] text-neutral-500 italic">
            Lo que los fisios y el head success no marcaron como hecho. Útil para detectar
            tareas que se les escapan. Visible solo para el CEO.
          </p>

          {weeks.map((weekIso) => {
            const entries = audit.filter((e) => e.weekStartIso === weekIso);
            const weekLabel = entries[0]?.weekLabel ?? "";
            return (
              <div key={weekIso}>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 mb-2">
                  {weekLabel}
                </div>
                <div className="space-y-2">
                  {entries.map((e) => (
                    <div
                      key={`${e.professionalId}-${weekIso}`}
                      className="rounded-lg p-2.5"
                      style={{
                        background: e.missingTotal === 0 ? "#F0FDF4" : "#FAFAFA",
                        border: `1px solid ${e.missingTotal === 0 ? "#BBF7D0" : "#F0F0F0"}`,
                      }}
                    >
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-sm font-medium">
                          {e.role === "head_success" ? "⭐ " : "🩺 "}{e.professionalName}
                        </span>
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{
                            background: e.missingTotal === 0 ? "#DCFCE7" : "#FEE2E2",
                            color: e.missingTotal === 0 ? "#14532D" : "#7F1D1D",
                          }}
                        >
                          {e.missingTotal === 0 ? "Todo marcado ✓" : `${e.missingTotal} sin marcar`}
                        </span>
                      </div>
                      {e.missingTotal === 0 ? null : (
                        <div className="space-y-1 mt-1.5">
                          {e.missingByDay.map((d) => (
                            <div key={d.dayOfWeek} className="text-xs">
                              <span className="font-medium text-neutral-600">{d.dayLabel}:</span>{" "}
                              <span className="text-neutral-700">{d.tasks.join(" · ")}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {audit.length === 0 && (
            <p className="text-sm text-neutral-400 italic text-center py-6">
              Aún no hay fisios o head_success activos para auditar.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
