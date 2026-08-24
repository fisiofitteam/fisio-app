"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FORMATS, GOALS, GOAL_COLOR_CLASSES, goalColor, type GoalKey } from "@/lib/content-formats";
import { DAY_LABELS } from "@/lib/content-templates";

/**
 * Modal "Añadir pieza" reutilizable desde:
 *  - La vista de semana (ThisWeekView): el botón "+ Añadir pieza" abre
 *    el modal con la semana ya fijada; el usuario solo elige día y formato.
 *  - El calendario (CalendarView): click en un día vacío abre el modal
 *    con día y semana ya fijados; el usuario solo elige el formato.
 *
 * Cuando confirmas, llama a POST /api/content/pieces y redirige al
 * editor de la pieza recién creada para que la rellenes.
 *
 * Si vienen `lockedDayOfWeek` o `lockedFormat`, los campos van fijados
 * (sin selector). Útil cuando ya sabemos el día por el contexto (click
 * en un día concreto del calendario).
 */
export function AddPieceModal({
  weekId,
  weekLabel,
  lockedDayOfWeek,
  lockedFormat,
  onClose,
}: {
  weekId: string;
  /** Texto contextual mostrado en la cabecera ("Esta semana", "Semana 24", etc.). */
  weekLabel?: string;
  lockedDayOfWeek?: number;
  lockedFormat?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [dayOfWeek, setDayOfWeek] = useState<number>(lockedDayOfWeek ?? 1);
  const [format, setFormat] = useState<string>(lockedFormat ?? "reel");
  const [title, setTitle] = useState("");
  const [goals, setGoals] = useState<GoalKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleGoal(g: GoalKey) {
    setGoals((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  }

  async function create() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/content/pieces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId,
          dayOfWeek,
          format: format || "",
          title: title.trim() || null,
          goals,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.piece?.id) {
        throw new Error(data?.error || "No se pudo crear la pieza");
      }
      // Redirección al editor de la pieza nueva para que la rellenes
      router.push(`/fisio/contenido/pieza/${data.piece.id}`);
    } catch (e: any) {
      setError(e?.message || "Error creando la pieza");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10, 10, 10, 0.55)" }}
      onClick={() => !busy && onClose()}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-base font-semibold">➕ Añadir pieza</h2>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-neutral-400 text-xl leading-none px-2"
          >
            ×
          </button>
        </div>
        {weekLabel && (
          <p className="text-xs text-neutral-500 mb-4">{weekLabel}</p>
        )}

        <div className="space-y-3">
          {lockedDayOfWeek === undefined && (
            <div>
              <label className="text-xs text-neutral-600 block mb-1">Día de la semana</label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="input text-sm w-full"
                disabled={busy}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
                  <option key={dow} value={dow}>
                    {DAY_LABELS[dow] ?? `Día ${dow}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {lockedFormat === undefined && (
            <div>
              <label className="text-xs text-neutral-600 block mb-1">Formato</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="input text-sm w-full"
                disabled={busy}
              >
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.icon} {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-neutral-600 block mb-1">
              Título (opcional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input text-sm w-full"
              placeholder="Ej. Mito del estiramiento de hombro"
              disabled={busy}
              autoFocus
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              Puedes dejarlo en blanco — la pieza se llamará por su formato hasta que la edites.
            </p>
          </div>

          <div>
            <label className="text-xs text-neutral-600 block mb-1">
              Objetivo(s) <span className="text-neutral-400">— opcional, coloreará la pieza en el calendario</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {GOALS.map((g) => {
                const active = goals.includes(g.value);
                return (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => toggleGoal(g.value)}
                    disabled={busy}
                    className={`text-xs px-2 py-1 rounded-lg transition ${
                      active
                        ? GOAL_COLOR_CLASSES[goalColor(g.value)]
                        : "bg-neutral-50 text-neutral-500 border border-neutral-200 hover:bg-neutral-100"
                    }`}
                  >
                    {active ? "✓ " : ""}{g.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", color: "#7F1D1D" }}
            >
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
            <button
              onClick={onClose}
              disabled={busy}
              className="text-sm text-neutral-500 px-3 py-2"
            >
              Cancelar
            </button>
            <button
              onClick={create}
              disabled={busy}
              className="text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              {busy ? "Creando…" : "➕ Crear y abrir"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
