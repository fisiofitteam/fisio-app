"use client";
/**
 * Panel IA: propone qué nivel asignar a cada categoría. Modal con plan + 1 botón.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

type Selection = {
  categoryId: string;
  categoryName: string;
  currentLevelId: string | null;
  currentLevelName: string | null;
  proposedLevelId: string;
  proposedLevelName: string;
  reason: string;
};
type Output = { resumenEstado: string; selections: Selection[]; flags: string[] };

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
    setLoading(true); setError(null); setOutput(null);
    try {
      const r = await fetch("/api/load-review/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, model: modelChoice }),
      });
      const text = await r.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch {}
      if (!r.ok) throw new Error(data?.error ?? `Error ${r.status}`);
      if (!data) throw new Error("Respuesta vacía");
      setRecordId(data.recordId); setModel(data.model); setOutput(data.output);
      setTokens({ input: data.inputTokens, output: data.outputTokens });
    } catch (e: any) { setError(e?.message ?? "Error"); }
    finally { setLoading(false); }
  }

  async function approve() {
    if (!recordId || !output) return;
    setClosing(true);
    try {
      const r = await fetch("/api/load-review/apply-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, patientId, selections: output.selections }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.error ?? "Error aplicando");
      }
      setOutput(null); setRecordId(null);
      router.refresh();
    } catch (e: any) { setError(e?.message ?? "Error"); }
    finally { setClosing(false); }
  }

  async function cancel() {
    if (!recordId) return;
    setClosing(true);
    try {
      await fetch("/api/load-review/record", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, decision: "ignore" }),
      });
      setOutput(null); setRecordId(null);
    } finally { setClosing(false); }
  }

  const changedCount = output?.selections.filter((s) => s.currentLevelId !== s.proposedLevelId).length ?? 0;

  return (
    <>
      <section className="card">
        <div className="flex justify-between items-start gap-2 flex-wrap">
          <div>
            <h2 className="font-medium text-sm">🧠 Sugerir niveles con IA</h2>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              La IA propone un nivel para cada categoría. Tú apruebas el plan completo o lo descartas. Luego puedes ajustar los selectores a mano.
            </p>
          </div>
          <button onClick={() => ask("claude-sonnet-4-6")} disabled={loading} className="btn btn-primary text-xs whitespace-nowrap">
            {loading ? "Pensando…" : "💡 Sugerir control"}
          </button>
        </div>
        {error && !output && <p className="text-xs text-red-700 mt-2">⚠️ {error}</p>}
      </section>

      {output && recordId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4 bg-black/50 overflow-y-auto" onClick={cancel}>
          <div className="bg-white rounded-2xl max-w-xl w-full my-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <header className="px-5 py-3 border-b border-neutral-200 flex justify-between items-center sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="font-semibold text-base">🧠 Plan IA: niveles por categoría</h3>
                <p className="text-[10px] text-neutral-500">
                  Modelo: {model === "claude-opus-4-7" ? "Opus 4.7" : "Sonnet 4.6"}
                  {tokens.input && tokens.output && <> · {tokens.input} in / {tokens.output} out</>}
                </p>
              </div>
              <button onClick={cancel} className="text-neutral-400 hover:text-neutral-700 text-xl">✕</button>
            </header>

            <div className="p-5 space-y-4">
              {output.resumenEstado && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Resumen</div>
                  <p className="text-sm whitespace-pre-wrap">{output.resumenEstado}</p>
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

              <div>
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2">
                  Selecciones ({changedCount} cambios, {output.selections.length - changedCount} sin cambio)
                </div>
                <div className="space-y-2">
                  {output.selections.map((s) => {
                    const changed = s.currentLevelId !== s.proposedLevelId;
                    return (
                      <div key={s.categoryId} className={`p-3 rounded border ${changed ? "border-emerald-200 bg-emerald-50/50" : "border-neutral-200 bg-neutral-50"}`}>
                        <div className="flex items-baseline justify-between gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{s.categoryName}</span>
                          <span className="text-xs">
                            {changed ? (
                              <>
                                <span className="text-neutral-400 line-through">{s.currentLevelName ?? "(sin asignar)"}</span>
                                <span className="mx-1">→</span>
                                <span className="text-emerald-800 font-medium">{s.proposedLevelName}</span>
                              </>
                            ) : (
                              <span className="text-neutral-500">{s.proposedLevelName}</span>
                            )}
                          </span>
                        </div>
                        {s.reason && <p className="text-[11px] text-neutral-600 mt-1 italic">💬 {s.reason}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && <p className="text-xs text-red-700">⚠ {error}</p>}
            </div>

            <footer className="px-5 py-3 border-t border-neutral-200 flex justify-between gap-2 flex-wrap sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={() => ask("claude-opus-4-7")} disabled={loading || closing} className="text-xs text-neutral-600 underline">
                🧠 Segunda opinión Opus
              </button>
              <div className="flex gap-2 flex-wrap">
                <button onClick={cancel} disabled={closing} className="btn text-xs text-red-700 border border-red-200 bg-white px-4 py-2">
                  Cancelar
                </button>
                <button onClick={approve} disabled={closing} className="btn btn-primary text-xs px-4 py-2">
                  {closing ? "Aplicando…" : "✓ Aprobar plan"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
