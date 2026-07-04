"use client";

import { useState } from "react";

type Block = { heading: string; body: string; exercises: string[] };
type Session = { title: string; description: string | null; blocks: Block[] };
type Meta = {
  model: string;
  kind: string;
  exampleIds: string[];
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
};

/**
 * Panel de "Probar generación" para el Brief IA. Envía prompt + contexto al
 * endpoint /api/ai/generate-session y renderiza la sesión devuelta más un
 * pequeño panel de metadata (modelo, tokens, tiempo, ids de ejemplos usados).
 */
export function AiSessionTester({ kind }: { kind: string }) {
  const [prompt, setPrompt] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<string>("");
  const [durationMin, setDurationMin] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  async function run() {
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
          dayOfWeek: dayOfWeek ? Number(dayOfWeek) : null,
          durationMin: durationMin ? Number(durationMin) : null,
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

  return (
    <div className="card space-y-3">
      <div>
        <h3 className="text-sm font-semibold">🧪 Probar generación</h3>
        <p className="text-[11px] text-neutral-500 mt-0.5">
          Prueba el generador con el brief actual del kind "{kind}". No guarda nada — es solo para afinar.
        </p>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-[11px] text-neutral-500 block mb-1">Prompt (obligatorio)</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder={kind === "accesorios"
              ? "Ej: día de accesorios técnicos de snatch, 40 min, foco en la posición overhead y activación de hombro."
              : "Ej: S5/D2 In-season. Sesión de fuerza + metcon medio con thruster + burpee. 60 min."}
            className="w-full text-sm bg-white border border-neutral-200 focus:border-neutral-400 rounded-md px-2 py-1.5 outline-none"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <div>
            <label className="text-[11px] text-neutral-500 block mb-1">Día (opcional)</label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-lg border border-neutral-200 bg-white"
            >
              <option value="">—</option>
              <option value="1">Lunes</option>
              <option value="2">Martes</option>
              <option value="3">Miércoles</option>
              <option value="4">Jueves</option>
              <option value="5">Viernes</option>
              <option value="6">Sábado</option>
              <option value="7">Domingo</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-neutral-500 block mb-1">Duración (opcional)</label>
            <input
              type="number"
              min={5}
              max={240}
              step={5}
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              placeholder="min"
              className="text-xs px-2 py-1.5 rounded-lg border border-neutral-200 bg-white w-20"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={run}
              disabled={busy || !prompt.trim()}
              className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              {busy ? "Generando…" : "✨ Generar"}
            </button>
          </div>
        </div>
      </div>

      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">⚠ {err}</div>}

      {session && (
        <SessionPreview session={session} meta={meta} />
      )}
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
            {meta.model} · {meta.inputTokens}→{meta.outputTokens} tok · {(meta.elapsedMs / 1000).toFixed(1)}s · {meta.exampleIds.length} ejemplos
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
