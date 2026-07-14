"use client";

/**
 * Genera un mesociclo completo de 4 semanas con IA:
 *   Sem 1 (introducción) → Sem 2 (progresión) → Sem 3 (pico) → Sem 4 (descarga)
 *
 * Estructura por semana: L/M/X/V trabajo generado por IA. J descanso activo
 * fijo (misma plantilla siempre). S/D descanso total.
 *
 * Estrategia (Opción B pactada con el CEO):
 *   - Genera semana a semana, mostrando progreso visible.
 *   - Cada semana recibe como contexto los títulos + ejercicios de las
 *     semanas previas → coherencia y no-repetición sin usar tokens de body.
 *   - Al terminar, vista tabla 4×4 con regenerar/editar por celda.
 *   - Guardar → crea/actualiza las 4 RollingWeek con sus tareas.
 */

import { useState } from "react";
import { durationForKind } from "@/components/AiGenerateSessionModal";

type Block = { heading: string; body: string; exercises: string[] };
type Session = { title: string; description: string | null; blocks: Block[] };
type Meta = { model: string; kind: string; exampleIds: string[]; inputTokens: number; outputTokens: number; elapsedMs: number };

type CellStatus = "idle" | "loading" | "ready" | "error";
type Cell = {
  weekNumber: 1 | 2 | 3 | 4;
  dayOfWeek: 1 | 2 | 3 | 5;   // L, M, X, V (J es descanso activo fijo)
  status: CellStatus;
  session?: Session;
  meta?: Meta;
  error?: string;
};

const WEEK_LABELS = ["Sem 1", "Sem 2", "Sem 3", "Sem 4"];
const WEEK_ROLE: Record<1|2|3|4, string> = {
  1: "Introducción",
  2: "Progresión",
  3: "Pico",
  4: "Descarga",
};
const DAY_LABELS: Record<1|2|3|4|5, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
};
const WORK_DAYS: Array<1|2|3|5> = [1, 2, 3, 5];

// Plantilla FIJA de descanso activo del jueves. El CEO puede editarla en
// código si quiere. Se aplica a las 4 semanas por igual.
const REST_ACTIVE_TEMPLATE = {
  title: "Descanso activo",
  description: "Recuperación entre sesiones — mantén el cuerpo despierto sin fatigar.",
  blocks: [
    {
      heading: "Aeróbico suave · 25-35 min",
      body: "Trote muy suave, bici easy o remo continuo a RPE 5-6. Deberías poder hablar con frases completas. Objetivo: activar recuperación, no sumar fatiga.",
      exercises: [],
    },
    {
      heading: "Movilidad global · 10-15 min",
      body: "Cat-camel x8 · 90/90 hip cada lado 5 respiraciones · Pigeon stretch cada lado 60s · Wall slide banded x10 · Puente glúteo x15.",
      exercises: [],
    },
  ] as Block[],
};

export function AiGenerateMesocycleModal({
  programId,
  defaultKind,
  kindLabel,
  startMonday,
  onClose,
  onSaved,
}: {
  programId: string;
  /** kind del brief IA: "accesorios" | "entrenamiento" | programId custom */
  defaultKind: string;
  /** Label del kind para mostrar en cabecera */
  kindLabel?: string;
  /** Lunes en que arranca el mesociclo (semana 1). ISO string. */
  startMonday: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ week: number; day: number } | null>(null);
  const [cells, setCells] = useState<Cell[]>(() => {
    const arr: Cell[] = [];
    for (const w of [1, 2, 3, 4] as const) {
      for (const d of WORK_DAYS) {
        arr.push({ weekNumber: w, dayOfWeek: d, status: "idle" });
      }
    }
    return arr;
  });
  const [err, setErr] = useState<string | null>(null);

  const kind = defaultKind;
  const kindNiceLabel = kindLabel ?? kind;

  // Helpers
  function updateCell(w: 1|2|3|4, d: 1|2|3|5, patch: Partial<Cell>) {
    setCells((prev) => prev.map((c) => (c.weekNumber === w && c.dayOfWeek === d ? { ...c, ...patch } : c)));
  }

  function cellsOfWeek(w: 1|2|3|4): Cell[] {
    return cells.filter((c) => c.weekNumber === w);
  }

  /** Contexto acumulado para pasar a la IA: sesiones anteriores del mesociclo. */
  function buildContext(currentWeek: 1|2|3|4, currentDay: 1|2|3|5): string {
    const phaseHint: Record<1|2|3|4, string> = {
      1: "Es la SEMANA 1 (introducción). Introduce el estímulo con volumen medio, técnica prioritaria, evita cargas máximas.",
      2: "Es la SEMANA 2 (progresión). Sube ~10% de volumen o intensidad respecto a la semana 1. Familias de ejercicios similares para consolidar patrones.",
      3: "Es la SEMANA 3 (pico). Máxima intensidad/volumen del mesociclo. Sesiones más exigentes, cargas cerca del tope técnico.",
      4: "Es la SEMANA 4 (descarga). Volumen -30-40% respecto a semana 3, misma técnica, cero cargas máximas. Objetivo: recuperar para el siguiente bloque.",
    };

    const parts: string[] = [
      `MESOCICLO DE 4 SEMANAS. ${phaseHint[currentWeek]}`,
      `Hoy programas la sesión de ${DAY_LABELS[currentDay]} de la semana ${currentWeek}.`,
    ];

    // Sesiones previas del mesociclo (solo títulos + ejercicios, no body completo)
    const previous = cells.filter((c) => {
      if (c.status !== "ready" || !c.session) return false;
      if (c.weekNumber < currentWeek) return true;
      if (c.weekNumber === currentWeek && c.dayOfWeek < currentDay) return true;
      return false;
    });

    if (previous.length > 0) {
      const lines = previous.map((c) => {
        const title = c.session?.title ?? "sesión";
        const exs = c.session?.blocks.flatMap((b) => b.exercises) ?? [];
        const exsUniq = Array.from(new Set(exs)).slice(0, 8).join(", ");
        return `  · S${c.weekNumber} ${DAY_LABELS[c.dayOfWeek].slice(0,3)}: "${title}"${exsUniq ? ` — ejercicios: ${exsUniq}` : ""}`;
      });
      parts.push(`SESIONES YA PROGRAMADAS EN EL MESOCICLO:\n${lines.join("\n")}`);
      parts.push("Evita repetir la misma familia de ejercicios más de 2-3 veces en las 16 sesiones totales. Varía el estímulo entre días.");
    }

    parts.push(`El jueves de cada semana es DESCANSO ACTIVO fijo (Z2 + movilidad) — no lo programes tú, se añade aparte.`);

    return parts.join("\n\n");
  }

  async function generateOne(w: 1|2|3|4, d: 1|2|3|5): Promise<void> {
    updateCell(w, d, { status: "loading", error: undefined });
    try {
      const res = await fetch("/api/ai/generate-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          prompt: prompt.trim(),
          dayOfWeek: d,
          durationMin: durationForKind(kind),
          extraContext: buildContext(w, d),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error");
      updateCell(w, d, { status: "ready", session: data.session, meta: data.meta });
    } catch (e: any) {
      updateCell(w, d, { status: "error", error: e?.message ?? "Error de red" });
    }
  }

  async function generateAll() {
    if (!prompt.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      for (const w of [1, 2, 3, 4] as const) {
        for (const d of WORK_DAYS) {
          setProgress({ week: w, day: d });
          await generateOne(w, d);
        }
      }
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  async function save() {
    // Requiere al menos 1 sesión ready. Las que estén en error o idle se
    // omiten silenciosamente — el fisio ya las verá vacías en el rolling.
    const anyReady = cells.some((c) => c.status === "ready" && c.session);
    if (!anyReady) {
      setErr("Genera al menos una sesión antes de guardar.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const startDate = new Date(startMonday);
      startDate.setHours(0, 0, 0, 0);
      const baseMonday = new Date(startDate);
      // Ajustar al lunes si viene otro día (fallback)
      const dow = baseMonday.getDay() === 0 ? 7 : baseMonday.getDay();
      baseMonday.setDate(baseMonday.getDate() - (dow - 1));

      // Crear las 4 RollingWeek y recoger sus weekIds
      const weekIds: Record<1|2|3|4, string> = {} as any;
      for (const w of [1, 2, 3, 4] as const) {
        const monday = new Date(baseMonday);
        monday.setDate(baseMonday.getDate() + (w - 1) * 7);
        const wRes = await fetch("/api/rolling-weeks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            programId,
            weekStartDate: monday.toISOString(),
            title: `Sem ${w}/4 · ${WEEK_ROLE[w]}`,
          }),
        });
        const wData = await wRes.json();
        if (!wRes.ok || !wData?.weekId) throw new Error(wData?.error ?? `No se pudo crear la semana ${w}`);
        weekIds[w] = wData.weekId;
      }

      // Guardar cada sesión ready via /api/rolling-tasks/from-session
      for (const c of cells) {
        if (c.status !== "ready" || !c.session) continue;
        const r = await fetch("/api/rolling-tasks/from-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            weekId: weekIds[c.weekNumber],
            dayOfWeek: c.dayOfWeek,
            session: c.session,
          }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d?.error ?? `Fallo guardando S${c.weekNumber} ${DAY_LABELS[c.dayOfWeek]}`);
        }
      }

      // Jueves = descanso activo fijo en las 4 semanas
      for (const w of [1, 2, 3, 4] as const) {
        await fetch("/api/rolling-tasks/from-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            weekId: weekIds[w],
            dayOfWeek: 4,
            session: REST_ACTIVE_TEMPLATE,
          }),
        });
      }

      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Error inesperado al guardar");
    } finally {
      setSaving(false);
    }
  }

  const readyCount = cells.filter((c) => c.status === "ready").length;
  const errorCount = cells.filter((c) => c.status === "error").length;
  const totalWork = cells.length;   // 16

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-3 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-4xl w-full p-4 my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-3 gap-2">
          <div>
            <h3 className="font-semibold text-base">🗓 Generar mesociclo (4 semanas)</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              4 semanas · L/M/X/V trabajo + J descanso activo · S/D descanso total.
              Usa el brief <strong>{kindNiceLabel}</strong>.
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>

        <div className="mb-3">
          <label className="text-[11px] text-neutral-500 block mb-1">
            Foco/tema del mesociclo (aplica a las 16 sesiones)
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder='Ej: "Bloque pre-comp Hyrox: foco en compresión aeróbica + resistencia a fuerza. L squat/press, M zone 2 largo, X full body strength, V metcon aeróbico". La IA respetará esta idea las 4 semanas ajustando volumen según la fase.'
            className="w-full text-sm bg-white border border-neutral-200 focus:border-neutral-400 rounded-md px-2 py-1.5 outline-none"
          />
        </div>

        <div className="flex gap-2 items-center justify-between flex-wrap mb-3">
          <div className="text-[11px] text-neutral-500 italic">
            ⏱ Duración por sesión: {durationForKind(kind)} min · 💡 Va semana a semana con contexto acumulado (~1-2 min total).
          </div>
          <button
            onClick={generateAll}
            disabled={busy || saving || !prompt.trim()}
            className="text-xs font-medium px-3 py-2 rounded-lg disabled:opacity-50"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            {busy
              ? progress ? `Generando S${progress.week} · ${DAY_LABELS[progress.day as 1|2|3|5]}…` : "Generando…"
              : readyCount > 0 ? "🔄 Regenerar todo" : "✨ Generar 16 sesiones"}
          </button>
        </div>

        {err && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5 mb-3">⚠ {err}</div>
        )}

        {/* Progress bar */}
        {busy && (
          <div className="mb-3 h-1.5 bg-neutral-200 rounded overflow-hidden">
            <div
              className="h-full bg-neutral-900 transition-all"
              style={{ width: `${(readyCount / totalWork) * 100}%` }}
            />
          </div>
        )}

        {/* Tabla 4x4 (+ columna J descanso activo) */}
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-xs border-separate" style={{ borderSpacing: "6px 6px" }}>
            <thead>
              <tr>
                <th className="text-left text-[10px] font-semibold text-neutral-500 uppercase tracking-wider"></th>
                {[1, 2, 3].map((d) => (
                  <th key={d} className="text-center text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                    {DAY_LABELS[d as 1|2|3].slice(0, 3)}
                  </th>
                ))}
                <th className="text-center text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#0F766E" }}>
                  Jue · Rest activo
                </th>
                <th className="text-center text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Vie</th>
              </tr>
            </thead>
            <tbody>
              {([1, 2, 3, 4] as const).map((w) => (
                <tr key={w}>
                  <td className="text-[10px] font-bold text-neutral-600 pr-2 align-top pt-2 whitespace-nowrap">
                    <div>{WEEK_LABELS[w - 1]}</div>
                    <div className="text-[9px] font-medium text-neutral-400 mt-0.5">{WEEK_ROLE[w]}</div>
                  </td>
                  {[1, 2, 3].map((d) => (
                    <td key={d} className="align-top" style={{ minWidth: 120 }}>
                      <SessionCell cell={cells.find((c) => c.weekNumber === w && c.dayOfWeek === d)!}
                        onRegenerate={() => generateOne(w, d as 1|2|3)} busy={busy} />
                    </td>
                  ))}
                  <td className="align-top" style={{ minWidth: 120 }}>
                    <div className="rounded-lg p-2 h-full border" style={{ background: "#F0FDFA", borderColor: "#99F6E4" }}>
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#0F766E" }}>Fijo</div>
                      <div className="text-[11px] font-medium mt-1" style={{ color: "#134E4A" }}>{REST_ACTIVE_TEMPLATE.title}</div>
                      <div className="text-[9px] mt-0.5" style={{ color: "#0F766E" }}>Aeróbico + movilidad</div>
                    </div>
                  </td>
                  <td className="align-top" style={{ minWidth: 120 }}>
                    <SessionCell cell={cells.find((c) => c.weekNumber === w && c.dayOfWeek === 5)!}
                      onRegenerate={() => generateOne(w, 5)} busy={busy} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Acciones inferiores */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-100 flex-wrap gap-2">
          <div className="text-[11px] text-neutral-500">
            {readyCount}/{totalWork} sesiones generadas
            {errorCount > 0 && <span className="ml-2 text-red-600">· {errorCount} con error (regenera individualmente)</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy || saving} className="btn btn-ghost text-xs">
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={busy || saving || readyCount === 0}
              className="btn btn-primary text-xs disabled:opacity-40"
            >
              {saving ? "Guardando…" : `💾 Programar ${readyCount + 4} sesiones (${readyCount} IA + 4 rest activo)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────── celda de sesión ──────────────────────────

function SessionCell({ cell, onRegenerate, busy }: { cell: Cell; onRegenerate: () => void; busy: boolean }) {
  if (cell.status === "idle") {
    return (
      <div className="rounded-lg p-2 h-full border border-dashed border-neutral-200 bg-neutral-50 min-h-16 flex items-center justify-center">
        <span className="text-[10px] text-neutral-400 italic">Sin generar</span>
      </div>
    );
  }
  if (cell.status === "loading") {
    return (
      <div className="rounded-lg p-2 h-full border border-blue-200 bg-blue-50 min-h-16 flex items-center justify-center">
        <span className="text-[10px] text-blue-700 italic">Generando…</span>
      </div>
    );
  }
  if (cell.status === "error") {
    return (
      <div className="rounded-lg p-2 h-full border border-red-200 bg-red-50 min-h-16">
        <div className="text-[10px] text-red-700">⚠ Error</div>
        <button onClick={onRegenerate} disabled={busy} className="text-[10px] mt-1 underline">Reintentar</button>
      </div>
    );
  }
  // ready
  const title = cell.session?.title ?? "Sesión";
  const blocksCount = cell.session?.blocks.length ?? 0;
  return (
    <div className="rounded-lg p-2 h-full border border-emerald-200 bg-emerald-50/60 min-h-16">
      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Lista</div>
      <div className="text-[11px] font-medium text-neutral-900 mt-0.5 line-clamp-2" title={title}>
        {title}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[9px] text-neutral-500">{blocksCount} bloques</span>
        <button
          onClick={onRegenerate}
          disabled={busy}
          className="text-[10px] text-neutral-500 hover:text-neutral-900 underline disabled:opacity-40"
        >
          Regenerar
        </button>
      </div>
    </div>
  );
}
