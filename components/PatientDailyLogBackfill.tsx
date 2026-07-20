"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, X } from "lucide-react";
import { PatientDailyLogForm } from "@/components/PatientDailyLogForm";

type MissingDay = { iso: string; label: string };

/**
 * Banner que aparece en /paciente/[id]/metricas cuando el atleta tiene
 * días recientes sin registrar. Le deja rellenar cada uno con un mini
 * form idéntico al del día actual — la sesión existe, solo se olvidó
 * anotar cómo se sintió. Estos backfills entran por el endpoint
 * daily-log con `recordedDate` explícito (validado hasta 14 días atrás).
 */
export function PatientDailyLogBackfill({ missing }: { missing: MissingDay[] }) {
  const [openDay, setOpenDay] = useState<string | null>(null);

  if (!missing || missing.length === 0) return null;

  return (
    <section
      className="rounded-2xl p-3 mb-4"
      style={{
        background: "rgba(252, 211, 77, 0.10)",
        border: "1px solid rgba(252, 211, 77, 0.35)",
      }}
    >
      <div className="flex items-start gap-2">
        <AlertCircle size={16} style={{ color: "#F59E0B" }} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: "var(--p-text)" }}>
            {missing.length === 1
              ? "Se te olvidó registrar 1 día"
              : `Se te olvidaron ${missing.length} días`}
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--p-text-dim)" }}>
            Puedes rellenarlos ahora — sirve para que la gráfica no tenga huecos.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {missing.map((d) => {
          const open = openDay === d.iso;
          return (
            <div
              key={d.iso}
              className="rounded-lg overflow-hidden"
              style={{
                background: "var(--p-surface)",
                border: "1px solid var(--p-border)",
              }}
            >
              <button
                type="button"
                onClick={() => setOpenDay(open ? null : d.iso)}
                className="w-full flex items-center justify-between px-3 py-2 text-left"
              >
                <span className="text-sm font-medium capitalize" style={{ color: "var(--p-text)" }}>
                  {d.label}
                </span>
                <span style={{ color: "var(--p-text-faint)" }}>
                  {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>
              {open && (
                <div className="px-3 pb-3 pt-1">
                  <PatientDailyLogForm
                    initial={null}
                    variant="embed"
                    recordedDate={d.iso}
                    onSaved={() => setOpenDay(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
