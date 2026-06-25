"use client";
/**
 * Panel de sugerencia IA para control de cargas — VERSIÓN PLAN APROBADO.
 *
 * Flujo:
 *  1. Fisio pulsa "💡 Sugerir cambios".
 *  2. La IA piensa. Aparece un MODAL con el planteamiento y un resumen de
 *     todos los cambios que va a aplicar.
 *  3. Si pulsa "Aprobar plan" → se aplican TODOS los cambios sobre los
 *     ejercicios del paciente. El modal se cierra y la pestaña se refresca
 *     mostrando ya las adaptaciones nuevas.
 *  4. Si pulsa "Cancelar" → se descarta sin tocar nada.
 *
 * Después, si quiere ajustar manualmente algún movimiento, lo hace en el
 * editor de adaptaciones de siempre.
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
  const [closing, setClosing] = useState(false);

  async function ask(modelChoice: "claude-sonnet-4-6" | "claude-opus-4-7") {
    setLoading(true);
    setError(null);
    setOutput(null);
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
    } catch (e: any) {
      setError(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  async function approvePlan() {
    if (!recordId || !output) return;
    setClosing(true);
    try {
      const r = await fetch("/api/load-review/apply-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId,
          patientId,
          changes: output.changes,
          decision: "apply",
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Error aplicando cambios");
      setOutput(null);
      setRecordId(null);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Error");
    } finally {
      setClosing(false);
    }
  }

  async function cancelPlan() {
    if (!recordId) return;
    setClosing(true);
    try {
      await fetch("/api/load-review/record", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, decision: "ignore", appliedNotes: null }),
      });
      setOutput(null);
      setRecordId(null);
    } finally {
      setClosing(false);
    }
  }

  return (
    <>
      <section className="card">
        <div className="flex justify-between items-start gap-2 flex-wrap">
          <div>
            <h2 className="font-medium text-sm">🧠 Control de cargas con IA</h2>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              La IA propone un plan de cambios sobre los ejercicios. Tú decides si lo apruebas tal cual.
              Luego puedes ajustar a mano cualquier movimiento si necesitas afinar.
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
        {error && !output && <p className="text-xs text-red-700 mt-2">⚠️ {error}</p>}
      </section>

      {output && recordId && (
        <PlanModal
          output={output}
          model={model}
          tokens={tokens}
          closing={closing}
          error={error}
          onApprove={approvePlan}
          onCancel={cancelPlan}
          onClose={() => { setOutput(null); setRecordId(null); }}
          onSecondOpinion={() => ask("claude-opus-4-7")}
        />
      )}
    </>
  );
}

function PlanModal({
  output, model, tokens, closing, error, onApprove, onCancel, onClose, onSecondOpinion,
}: {
  output: Output;
  model: string | null;
  tokens: { input?: number; output?: number };
  closing: boolean;
  error: string | null;
  onApprove: () => void;
  onCancel: () => void;
  onClose: () => void;
  onSecondOpinion: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4 bg-black/50 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full my-8 shadow-2xl">
        <header className="px-5 py-3 border-b border-neutral-200 flex justify-between items-center sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h3 className="font-semibold text-base">🧠 Plan de cambios sugerido</h3>
            <p className="text-[10px] text-neutral-500">
              Modelo: {model === "claude-opus-4-7" ? "Opus 4.7" : "Sonnet 4.6"}
              {tokens.input && tokens.output && <> · {tokens.input} in / {tokens.output} out tokens</>}
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl">✕</button>
        </header>

        <div className="p-5 space-y-4">
          {output.resumenEstado && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Resumen del estado</div>
              <p className="text-sm whitespace-pre-wrap text-neutral-900">{output.resumenEstado}</p>
            </div>
          )}

          {output.flags.length > 0 && (
            <div className="p-3 rounded border border-amber-200 bg-amber-50">
              <div className="text-[10px] uppercase tracking-wide text-amber-700 mb-1">⚠ Atención</div>
              <ul className="text-xs text-amber-900 space-y-0.5">
                {output.flags.map((f, i) => <li key={i}>· {f}</li>)}
              </ul>
            </div>
          )}

          {output.changes.length === 0 ? (
            <div className="p-3 rounded bg-blue-50 border border-blue-200 text-sm text-blue-900">
              <strong>Sin cambios sugeridos esta semana.</strong>
              {output.noChangeReason && <p className="mt-1 text-xs">{output.noChangeReason}</p>}
            </div>
          ) : (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2">
                Cambios que se aplicarán ({output.changes.length})
              </div>
              <div className="space-y-2">
                {output.changes.map((c) => (
                  <div key={c.movementId} className="p-3 rounded border border-neutral-200 bg-neutral-50">
                    <div className="text-sm font-semibold">{c.movementName}</div>
                    <DiffRow label="Estado" before={c.current.state} after={c.proposed.state} />
                    <DiffRow label="Carga máx" before={c.current.loadConstraint} after={c.proposed.loadConstraint} />
                    <DiffRow label="Sustitución" before={c.current.substitutionText} after={c.proposed.substitutionText} />
                    <DiffRow label="Warning" before={c.current.physioWarning} after={c.proposed.physioWarning} />
                    {c.reason && <p className="text-[11px] text-neutral-500 mt-2 italic">💬 {c.reason}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-700">⚠️ {error}</p>}
        </div>

        <footer className="px-5 py-3 border-t border-neutral-200 flex justify-between gap-2 flex-wrap sticky bottom-0 bg-white rounded-b-2xl">
          <button
            onClick={onSecondOpinion}
            disabled={closing}
            className="text-xs text-neutral-600 underline"
            title="Regenerar con Opus 4.7"
          >
            🧠 Segunda opinión Opus
          </button>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={onCancel}
              disabled={closing}
              className="btn text-xs text-red-700 border border-red-200 bg-white px-4 py-2"
            >
              Cancelar
            </button>
            {output.changes.length > 0 && (
              <button
                onClick={onApprove}
                disabled={closing}
                className="btn btn-primary text-xs px-4 py-2"
              >
                {closing ? "Aplicando…" : "✓ Aprobar plan"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function DiffRow({ label, before, after }: { label: string; before: string | null; after: string | null }) {
  const beforeStr = before ?? "—";
  const afterStr = after ?? "—";
  const same = beforeStr === afterStr;
  if (same && (before === null && after === null)) return null;
  return (
    <div className="text-xs mt-1 flex gap-2">
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
