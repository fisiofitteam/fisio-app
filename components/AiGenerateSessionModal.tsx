"use client";

import { useState } from "react";

type Block = { heading: string; body: string; exercises: string[] };
type Session = { title: string; description: string | null; blocks: Block[] };
type Meta = { model: string; kind: string; exampleIds: string[]; inputTokens: number; outputTokens: number; elapsedMs: number };

const DAY_LABELS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

// Duraciones fijas por tipo de sesión (decisión de la CEO): entrenamiento
// principal siempre ~60 min, accesorios siempre ~15 min. Los programas
// custom (kind=programId) heredan 60 min por defecto.
export const FIXED_DURATION_BY_KIND: Record<string, number> = {
  accesorios: 15,
  entrenamiento: 60,
};
export function durationForKind(kind: string): number {
  return FIXED_DURATION_BY_KIND[kind] ?? 60;
}

/**
 * Modal completo del flujo "Generar con IA":
 *  1. Elige kind (accesorios/entrenamiento) + prompt + duración opcional.
 *  2. Pulsa "✨ Generar" → llama a /api/ai/generate-session.
 *  3. Ve preview de la sesión con bloques y ejercicios.
 *  4. Puede "🔄 Regenerar" (mismo prompt, otro tiro) o "💾 Guardar en el día"
 *     que crea 1 tarea WORKOUT por bloque en el día seleccionado.
 */
export function AiGenerateSessionModal({
  weekId,
  dayOfWeek,
  defaultKind = "accesorios",
  kindLabel,
  onClose,
  onSaved,
}: {
  weekId: string;
  dayOfWeek: number;
  /** "accesorios" | "entrenamiento" | programId del RollingProgram custom */
  defaultKind?: string;
  /** Label del kind custom para mostrar en el UI. Solo se usa si kind no es builtin. */
  kindLabel?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<string>(defaultKind);
  const isBuiltin = kind === "accesorios" || kind === "entrenamiento";
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  async function generate() {
    if (!prompt.trim()) return;
    setBusy(true);
    setErr(null);
    setSession(null);
    setMeta(null);
    try {
      const res = await fetch("/api/ai/generate-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          prompt: prompt.trim(),
          dayOfWeek,
          durationMin: durationForKind(kind),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Error");
      setSession(d.session);
      setMeta(d.meta);
    } catch (e: any) {
      setErr(e?.message ?? "Error de red");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!session) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/rolling-tasks/from-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId, dayOfWeek, session }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Error al guardar");
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Error de red");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-2xl w-full p-4 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-3 gap-2">
          <div>
            <h3 className="font-semibold text-base">✨ Generar sesión con IA</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Día objetivo: {DAY_LABELS[dayOfWeek] ?? dayOfWeek}. Cada bloque se crea como una tarea del día.
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>

        {/* Kind selector (solo si son builtins; los custom quedan fijos al programa) */}
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
                  {k === "accesorios" ? "Accesorios (movilidad · técnica)" : "Entrenamiento (fuerza · metcon)"}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-3 text-[11px] text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5">
            Brief usado: <strong className="text-neutral-800">{kindLabel ?? kind}</strong>
          </div>
        )}

        {/* Prompt */}
        <div className="mb-3">
          <label className="text-[11px] text-neutral-500 block mb-1">Prompt (di qué buscas)</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder={
              kind === "accesorios"
                ? "Ej: accesorios de snatch, foco overhead y activación de hombro."
                : "Ej: S5/D2 In-season. Fuerza + metcon medio con thruster + burpee, 60 min."
            }
            className="w-full text-sm bg-white border border-neutral-200 focus:border-neutral-400 rounded-md px-2 py-1.5 outline-none"
          />
        </div>

        <div className="flex gap-2 items-center justify-between flex-wrap mb-3">
          <p className="text-[11px] text-neutral-500 italic">
            ⏱ Duración fija · {durationForKind(kind)} min
          </p>
          <button
            onClick={generate}
            disabled={busy || saving || !prompt.trim()}
            className="text-xs font-medium px-3 py-2 rounded-lg disabled:opacity-50"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            {busy ? "Generando…" : session ? "🔄 Regenerar" : "✨ Generar"}
          </button>
        </div>

        {err && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5 mb-3">⚠ {err}</div>
        )}

        {session && (
          <SessionPreview session={session} meta={meta} />
        )}

        {/* Acciones inferiores */}
        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-neutral-100">
          <button
            onClick={onClose}
            className="text-xs text-neutral-600 hover:underline px-2"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={!session || saving || busy}
            className="text-xs font-medium px-3 py-2 rounded-lg disabled:opacity-50"
            style={{ background: "#059669", color: "#FAFAFA" }}
          >
            {saving ? "Guardando…" : "💾 Guardar en el día"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionPreview({ session, meta }: { session: Session; meta: Meta | null }) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h4 className="text-base font-semibold">{session.title}</h4>
        {meta && (
          <div className="text-[10px] text-neutral-500 tabular-nums">
            {meta.model} · {meta.inputTokens}→{meta.outputTokens} tok · {(meta.elapsedMs / 1000).toFixed(1)}s
          </div>
        )}
      </div>
      {session.description && (
        <p className="text-xs text-neutral-700 italic border-l-2 border-neutral-300 pl-2">{session.description}</p>
      )}
      <div className="space-y-3">
        {session.blocks.map((b, i) => (
          <div key={i}>
            <div className="text-xs font-bold uppercase tracking-wide text-neutral-800">{b.heading}</div>
            <pre className="text-xs whitespace-pre-wrap font-mono bg-white border border-neutral-200 rounded p-2 mt-1">{b.body}</pre>
            {b.exercises.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {b.exercises.map((e, j) => (
                  <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700">{e}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
