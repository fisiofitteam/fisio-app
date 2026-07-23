"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { PatientDailyLogForm } from "@/components/PatientDailyLogForm";

type Entry = {
  id: string;
  recordedDate: string; // ISO
  fatigue: number;
  rpe: number;
  sleep: number;
};

/**
 * Histórico de registros diarios con edición inline. Cada entrada muestra
 * un resumen (🪫 X · 🔥 X · 😴 X); si el día cae dentro de los últimos
 * 14 (que es el límite que impone el endpoint), se puede desplegar para
 * corregir los valores.
 *
 * Los días más antiguos se pintan readonly — el endpoint rechaza esas
 * fechas por seguridad.
 */
export function PatientDailyLogHistoryList({ entries, editableWindowDays = 14 }: { entries: Entry[]; editableWindowDays?: number }) {
  const [openId, setOpenId] = useState<string | null>(null);

  const todayMs = Date.now();

  return (
    <ul className="mt-3 space-y-1">
      {entries.map((e) => {
        const dt = new Date(e.recordedDate);
        const diffDays = Math.round((todayMs - dt.getTime()) / 86400000);
        const editable = diffDays >= 0 && diffDays <= editableWindowDays;
        const open = openId === e.id;
        const iso = new Date(e.recordedDate).toISOString().slice(0, 10);
        return (
          <li
            key={e.id}
            className="rounded-xl overflow-hidden"
            style={{ background: "var(--p-surface-2)", border: "1px solid var(--p-border)" }}
          >
            <button
              type="button"
              onClick={() => editable && setOpenId(open ? null : e.id)}
              disabled={!editable}
              className={`w-full px-3 py-2 flex items-center justify-between gap-3 text-sm text-left ${editable ? "cursor-pointer" : "cursor-default"}`}
            >
              <span className="text-xs capitalize" style={{ color: "var(--p-text-dim)" }}>
                {dt.toLocaleDateString("es-ES", { day: "numeric", month: "short", weekday: "short" })}
              </span>
              <div className="flex items-center gap-3 tabular-nums text-xs">
                <span title="Fatiga">🪫 {e.fatigue}</span>
                <span title="RPE">🔥 {e.rpe}</span>
                <span title="Sueño">😴 {e.sleep}</span>
                {editable ? (
                  <span style={{ color: "var(--p-text-faint)" }}>
                    {open ? <ChevronUp size={14} /> : <Pencil size={12} />}
                  </span>
                ) : (
                  <span className="text-[10px] italic" style={{ color: "var(--p-text-faint)" }}>
                    (no editable)
                  </span>
                )}
              </div>
            </button>
            {open && editable && (
              <div className="px-3 pb-3 pt-1">
                <PatientDailyLogForm
                  initial={{ fatigue: e.fatigue, rpe: e.rpe, sleep: e.sleep }}
                  variant="embed"
                  recordedDate={iso}
                  onSaved={() => setOpenId(null)}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
