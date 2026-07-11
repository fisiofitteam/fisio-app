"use client";

import { useState } from "react";
import { durationForKind } from "@/components/AiGenerateSessionModal";

type Block = { heading: string; body: string; exercises: string[] };
type Session = { title: string; description: string | null; blocks: Block[] };
type Meta = { model: string; kind: string; exampleIds: string[]; inputTokens: number; outputTokens: number; elapsedMs: number };

type DayResult =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; session: Session; meta: Meta }
  | { status: "error"; message: string };

const DAY_LABELS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

/**
 * Modal "✨ Generar semana completa con IA".
 * Lanza 5 llamadas en paralelo a /api/ai/generate-session (una por día L-V)
 * con la misma pista/prompt y el mismo kind. Al terminar cada una, aparece
 * su preview y se puede regenerar por día. Al pulsar "Guardar toda la
 * semana", se guardan las 5 secuencialmente vía /api/rolling-tasks/from-session.
 */
export function AiGenerateWeekModal({
  weekId,
  defaultKind = "accesorios",
  kindLabel,
  onClose,
  onSaved,
}: {
  weekId: string;
  /** "accesorios" | "entrenamiento" | programId del RollingProgram custom */
  defaultKind?: string;
  kindLabel?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<string>(defaultKind);
  const isBuiltin = kind === "accesorios" || kind === "entrenamiento";
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingProgress, setSavingProgress] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState<Record<number, DayResult>>(() => {
    const initial: Record<number, DayResult> = {};
    for (let d = 1; d <= 5; d++) initial[d] = { status: "idle" };
    return initial;
  });

  /**
   * Genera un día concreto pasando como contexto extra qué ejercicios ya
   * han salido en días previos. Esto es lo que evita que Claude repita
   * "back squat" el lunes y otra vez el martes.
   */
  async function generateForDay(dow: number, alreadyUsed: string[] = []) {
    setDays((prev) => ({ ...prev, [dow]: { status: "loading" } }));
    const contextParts: string[] = [
      `Sesión de ${DAY_LABELS[dow]} de la semana. Encaja con el plan semanal.`,
    ];
    if (alreadyUsed.length > 0) {
      contextParts.push(
        `Estos ejercicios YA se han programado en días anteriores de esta misma semana — NO los repitas hoy: ${alreadyUsed.join(", ")}.`
      );
    }
    try {
      const res = await fetch("/api/ai/generate-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          prompt: prompt.trim(),
          dayOfWeek: dow,
          durationMin: durationForKind(kind),
          extraContext: contextParts.join(" "),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Error");
      setDays((prev) => ({ ...prev, [dow]: { status: "ready", session: d.session, meta: d.meta } }));
      return d.session as Session;
    } catch (e: any) {
      setDays((prev) => ({ ...prev, [dow]: { status: "error", message: e?.message ?? "Error de red" } }));
      return null;
    }
  }

  function collectExercises(sessions: (Session | null)[]): string[] {
    const seen = new Set<string>();
    for (const s of sessions) {
      if (!s) continue;
      for (const b of s.blocks) {
        for (const ex of b.exercises) {
          const norm = ex.trim();
          if (norm) seen.add(norm);
        }
      }
    }
    return [...seen];
  }

  async function generateAll() {
    if (!prompt.trim()) return;
    setBusy(true);
    setErr(null);
    // Reset a "loading" para los 5 antes de arrancar
    const resetLoading: Record<number, DayResult> = {};
    for (let d = 1; d <= 5; d++) resetLoading[d] = { status: "loading" };
    setDays(resetLoading);

    // Generación SECUENCIAL con contexto acumulativo: cada día recibe la
    // lista de ejercicios de los días previos con orden explícito de no
    // repetirlos. Es ~1.5x más lento que paralelo pero da coherencia semanal.
    const generated: (Session | null)[] = [];
    for (const dow of [1, 2, 3, 4, 5]) {
      const alreadyUsed = collectExercises(generated);
      const s = await generateForDay(dow, alreadyUsed);
      generated.push(s);
    }
    setBusy(false);
  }

  async function saveAll() {
    const ready = [1, 2, 3, 4, 5]
      .map((dow) => ({ dow, r: days[dow] }))
      .filter((x): x is { dow: number; r: { status: "ready"; session: Session; meta: Meta } } => x.r.status === "ready");
    if (ready.length === 0) return;
    setSaving(true);
    setErr(null);
    setSavingProgress({ done: 0, total: ready.length });
    for (let i = 0; i < ready.length; i++) {
      const { dow, r } = ready[i];
      try {
        const res = await fetch("/api/rolling-tasks/from-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekId, dayOfWeek: dow, session: r.session }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d?.error ?? `Fallo al guardar el ${DAY_LABELS[dow]}`);
        setSavingProgress({ done: i + 1, total: ready.length });
      } catch (e: any) {
        setErr(e?.message ?? "Error de red");
        setSaving(false);
        setSavingProgress(null);
        return;
      }
    }
    setSaving(false);
    setSavingProgress(null);
    onSaved();
  }

  const anyReady = Object.values(days).some((d) => d.status === "ready");

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-3xl w-full p-4 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-3 gap-2">
          <div>
            <h3 className="font-semibold text-base">✨ Generar semana completa con IA</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Genera los 5 días (L-V) de la semana en una sola tirada. Cada día crea tareas WORKOUT propias.
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>

        {/* Kind selector (solo builtins) */}
        {isBuiltin ? (
          <div className="mb-3">
            <label className="text-[11px] text-neutral-500 block mb-1">Tipo de sesión</label>
            <div className="flex gap-1">
              {(["accesorios", "entrenamiento"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex-1 text-xs px-2 py-2 rounded border font-medium ${
                    kind === k ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
                  }`}
                >
                  {k === "accesorios" ? "Accesorios · 15 min/día" : "Entrenamiento · 60 min/día"}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-3 text-[11px] text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5">
            Brief usado: <strong className="text-neutral-800">{kindLabel ?? kind}</strong>
          </div>
        )}

        {/* Prompt: aquí lo mejor es "temática de la semana" */}
        <div className="mb-3">
          <label className="text-[11px] text-neutral-500 block mb-1">
            Foco/tema de la semana (para los 5 días)
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder={
              kind === "accesorios"
                ? "Ej: semana de foco hombro y overhead squat. Lunes activación torácica, martes técnica jerk, miércoles gymnastics dorsal, jueves cadera/tobillo, viernes core."
                : "Ej: S5 In-season. Foco fuerza en snatch + WODs cortos con thruster + burpee. Lunes squat, martes snatch, miércoles conditioning, jueves DL + gym, viernes open prep."
            }
            className="w-full text-sm bg-white border border-neutral-200 focus:border-neutral-400 rounded-md px-2 py-1.5 outline-none"
          />
        </div>

        <div className="flex gap-2 items-center justify-between flex-wrap mb-3">
          <p className="text-[11px] text-neutral-500 italic">
            ⏱ Duración fija · {durationForKind(kind)} min por día. 💡 Se generan L→V en secuencia (~40-60s) para no repetir ejercicios.
          </p>
          <button
            onClick={generateAll}
            disabled={busy || saving || !prompt.trim()}
            className="text-xs font-medium px-3 py-2 rounded-lg disabled:opacity-50"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            {busy ? "Generando…" : anyReady ? "🔄 Regenerar todo" : "✨ Generar los 5 días"}
          </button>
        </div>

        {err && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5 mb-3">⚠ {err}</div>
        )}

        {/* Grid de previews por día */}
        {(busy || anyReady) && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
            {[1, 2, 3, 4, 5].map((dow) => (
              <DayPreview
                key={dow}
                dow={dow}
                result={days[dow]}
                onRegenerate={() => generateForDay(dow)}
              />
            ))}
          </div>
        )}

        {/* Acciones inferiores */}
        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-neutral-100 flex-wrap">
          {savingProgress && (
            <span className="text-[11px] text-neutral-500">
              Guardando {savingProgress.done}/{savingProgress.total}…
            </span>
          )}
          <button
            onClick={onClose}
            className="text-xs text-neutral-600 hover:underline px-2"
          >
            Cancelar
          </button>
          <button
            onClick={saveAll}
            disabled={!anyReady || saving || busy}
            className="text-xs font-medium px-3 py-2 rounded-lg disabled:opacity-50"
            style={{ background: "#059669", color: "#FAFAFA" }}
            title="Crea las tareas WORKOUT de los 5 días en la semana actual"
          >
            {saving ? "Guardando…" : "💾 Guardar toda la semana"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DayPreview({
  dow,
  result,
  onRegenerate,
}: {
  dow: number;
  result: DayResult;
  onRegenerate: () => void;
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50/40 p-2 flex flex-col gap-1.5 min-h-[140px]">
      <div className="flex items-center justify-between gap-1">
        <div className="text-[10px] font-bold tracking-wider uppercase text-neutral-700">
          {DAY_LABELS[dow]}
        </div>
        {result.status === "ready" && (
          <button
            type="button"
            onClick={onRegenerate}
            className="text-[10px] text-neutral-400 hover:text-neutral-800"
            title="Regenerar solo este día"
          >
            🔄
          </button>
        )}
      </div>
      {result.status === "idle" && (
        <p className="text-[11px] italic text-neutral-400">—</p>
      )}
      {result.status === "loading" && (
        <p className="text-[11px] italic text-neutral-500">Generando…</p>
      )}
      {result.status === "error" && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] text-red-600">⚠ {result.message}</p>
          <button
            type="button"
            onClick={onRegenerate}
            className="text-[11px] text-blue-700 underline text-left"
          >
            Reintentar
          </button>
        </div>
      )}
      {result.status === "ready" && (
        <div>
          <div className="text-xs font-semibold leading-tight mb-1">
            {result.session.title}
          </div>
          <div className="space-y-1">
            {result.session.blocks.map((b, i) => (
              <div key={i}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-800">
                  {b.heading}
                </div>
                <pre className="text-[10px] whitespace-pre-wrap font-mono bg-white border border-neutral-200 rounded p-1.5 mt-0.5 leading-tight">
                  {b.body}
                </pre>
              </div>
            ))}
          </div>
          <div className="text-[9px] text-neutral-400 mt-1.5 tabular-nums">
            {result.meta.inputTokens}→{result.meta.outputTokens} tok · {(result.meta.elapsedMs / 1000).toFixed(1)}s
          </div>
        </div>
      )}
    </div>
  );
}
