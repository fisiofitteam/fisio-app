"use client";
/**
 * Panel de sugerencia IA para control de cargas — VERSIÓN CAMBIOS CONCRETOS.
 *
 * El fisio pulsa "💡 Sugerir cambios" y la IA propone modificaciones concretas
 * sobre los ejercicios del paciente (state OK/CONDITIONAL/BLOCKED + load +
 * sustitución + warning). El fisio marca cuáles quiere aplicar y pulsa
 * "Aplicar seleccionados".
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

type Slot = {
  state: "OK" | "CONDITIONAL" | "BLOCKED" | null;
  loadConstraint: string | null;
  substitutionText: string | null;
  physioWarning: string | null;
};
type Change = {
  movementId: string;
  movementName: string;
  current: Slot;
  proposed: Slot;
  reason: string;
};
type Output = {
  resumenEstado: string;
  changes: Change[];
  flags: string[];
  noChangeReason?: string;
};

export function LoadReviewSuggestionPanel({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [output, setOutput] = useState<Output | null>(null);
  const [tokens, setTokens] = useState<{ input?: number; output?: number }>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [closing, setClosing] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  async function ask(modelChoice: "claude-sonnet-4-6" | "claude-opus-4-7") {
    setLoading(true);
    setError(null);
    setOutput(null);
    setSelected(new Set());
    setDoneMsg(null);
    try {
      const r = await fetch("/api/load-review/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, model: modelChoice }),
      });
      const text = await r.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch {}
      if (!r.ok) {
        const msg = data?.error ?? (r.status === 504 ? "Timeout (reintenta en 30s, ya estará cacheado)" : `Error ${r.status}`);
        throw new Error(msg);
      }
      if (!data) throw new Error("Respuesta vacía del servidor");
      setRecordId(data.recordId);
      setModel(data.model);
      setOutput(data.output);
      setTokens({ input: data.inputTokens, output: data.outputTokens });
      // Por defecto, selecciono todos los cambios propuestos (el fisio deselecciona los que no quiera).
      setSelected(new Set((data.output?.changes ?? []).map((c: Change) => c.movementId)));
    } catch (e: any) {
      setError(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  async function applySelected() {
    if (!recordId || !output) return;
    const changesToApply = output.changes.filter((c) => selected.has(c.movementId));
    if (changesToApply.length === 0) {
      // Sin cambios seleccionados → tratamos como "ignorar"
      return ignoreAll();
    }
    setClosing(true);
    try {
      const allSelected = changesToApply.length === output.changes.length;
      const r = await fetch("/api/load-review/apply-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId,
          patientId,
          changes: changesToApply,
          decision: allSelected ? "apply" : "edit",
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Error aplicando cambios");
      setDoneMsg(`✓ Aplicados ${data.applied} cambio${data.applied !== 1 ? "s" : ""} al control de cargas.`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Error");
    } finally {
      setClosing(false);
    }
  }

  async function ignoreAll() {
    if (!recordId) return;
    setClosing(true);
    try {
      await fetch("/api/load-review/record", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, decision: "ignore", appliedNotes: null }),
      });
      setDoneMsg("❌ Sugerencia descartada.");
      router.refresh();
    } finally {
      setClosing(false);
    }
  }

  if (doneMsg) {
    return (
      <section className="card bg-emerald-50 border-emerald-200">
        <p className="text-sm text-emerald-900">{doneMsg}</p>
        <button
          onClick={() => { setDoneMsg(null); setOutput(null); setRecordId(null); setSelected(new Set()); }}
          className="text-xs text-emerald-800 underline mt-2"
        >
          Pedir otra sugerencia
        </button>
      </section>
    );
  }

  if (!output) {
    return (
      <section className="card">
        <div className="flex justify-between items-start gap-2 flex-wrap">
          <div>
            <h2 className="font-medium text-sm">🧠 Control de cargas con IA</h2>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              La IA propone cambios CONCRETOS por ejercicio (estado, carga máx, sustitución, warning). Tú marcas cuáles aceptas y pulsas aplicar.
            </p>
          </div>
          <button
            onClick={() => ask("claude-sonnet-4-6")}
            disabled={loading}
            className="btn btn-primary text-xs whitespace-nowrap"
          >
            {loading ? "Pensando…" : "💡 Sugerir cambios"}
          </button>
        </div>
        {error && <p className="text-xs text-red-700 mt-2">⚠️ {error}</p>}
      </section>
    );
  }

  return (
    <section className="card border-amber-200 bg-amber-50/30">
      <header className="flex justify-between items-start gap-2 flex-wrap mb-3">
        <div>
          <h2 className="font-medium text-sm">🧠 Cambios propuestos</h2>
          <p className="text-[10px] text-neutral-500">
            Modelo: {model === "claude-opus-4-7" ? "Opus 4.7" : "Sonnet 4.6"}
            {tokens.input && tokens.output && <> · {tokens.input} in / {tokens.output} out tokens</>}
          </p>
        </div>
        <button
          onClick={() => ask("claude-opus-4-7")}
          disabled={loading || closing}
          className="text-xs text-neutral-600 underline"
          title="Regenera con Opus 4.7"
        >
          {loading ? "…" : "🧠 Segunda opinión Opus"}
        </button>
      </header>

      <div className="space-y-3">
        {output.resumenEstado && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Resumen del estado</div>
            <p className="text-sm whitespace-pre-wrap text-neutral-900">{output.resumenEstado}</p>
          </div>
        )}

        {output.flags.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-amber-700 mb-1">⚠ Flags</div>
            <ul className="text-xs text-amber-900 space-y-0.5">
              {output.flags.map((f, i) => <li key={i}>· {f}</li>)}
            </ul>
          </div>
        )}

        {output.changes.length === 0 ? (
          <div className="p-3 rounded bg-blue-50 border border-blue-200 text-sm text-blue-900">
            <strong>Sin cambios sugeridos.</strong>
            {output.noChangeReason && <p className="mt-1 text-xs">{output.noChangeReason}</p>}
          </div>
        ) : (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2">
              Cambios concretos ({output.changes.length})
            </div>
            <div className="space-y-2">
              {output.changes.map((c) => {
                const sel = selected.has(c.movementId);
                return (
                  <div
                    key={c.movementId}
                    className={`p-2 rounded border ${sel ? "border-emerald-300 bg-white" : "border-neutral-200 bg-neutral-50/60 opacity-70"}`}
                  >
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => {
                          setSelected((prev) => {
                            const n = new Set(prev);
                            if (n.has(c.movementId)) n.delete(c.movementId); else n.add(c.movementId);
                            return n;
                          });
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold">{c.movementName}</div>
                        <DiffRow label="Estado" before={c.current.state} after={c.proposed.state} />
                        <DiffRow label="Carga máx" before={c.current.loadConstraint} after={c.proposed.loadConstraint} />
                        <DiffRow label="Sustitución" before={c.current.substitutionText} after={c.proposed.substitutionText} />
                        <DiffRow label="Warning" before={c.current.physioWarning} after={c.proposed.physioWarning} />
                        {c.reason && (
                          <p className="text-[11px] text-neutral-500 mt-1 italic">💬 {c.reason}</p>
                        )}
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-4 flex-wrap">
        {output.changes.length > 0 && (
          <button
            onClick={applySelected}
            disabled={closing || selected.size === 0}
            className="btn btn-primary text-xs"
          >
            ✓ Aplicar seleccionados ({selected.size})
          </button>
        )}
        <button
          onClick={ignoreAll}
          disabled={closing}
          className="btn text-xs text-red-700 border border-red-200 bg-white"
        >
          ❌ Ignorar todo
        </button>
      </div>

      {error && <p className="text-xs text-red-700 mt-2">⚠️ {error}</p>}
    </section>
  );
}

function DiffRow({ label, before, after }: { label: string; before: string | null; after: string | null }) {
  // Sólo pintamos si hay cambio respecto al actual.
  const beforeStr = before ?? "—";
  const afterStr = after ?? "—";
  const same = beforeStr === afterStr;
  if (same && (before === null && after === null)) return null;
  return (
    <div className="text-xs mt-0.5 flex gap-1">
      <span className="text-neutral-500 w-20 flex-shrink-0">{label}:</span>
      {same ? (
        <span className="text-neutral-500">{afterStr}</span>
      ) : (
        <span className="flex-1">
          <span className="text-neutral-400 line-through">{beforeStr}</span>
          <span className="mx-1 text-neutral-400">→</span>
          <span className="text-emerald-800 font-medium">{afterStr}</span>
        </span>
      )}
    </div>
  );
}
