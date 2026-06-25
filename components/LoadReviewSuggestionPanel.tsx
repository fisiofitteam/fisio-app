"use client";
/**
 * Panel de sugerencia IA para control de cargas.
 *
 * - Botón "💡 Sugerir control" → llama a /api/load-review/suggest (Sonnet 4.6).
 * - Tras recibir, muestra resumen + propuesta + razonamiento + flags + alternativas.
 * - Botones: ✓ Aplicar tal cual / ✏️ Editar y aplicar / ❌ Ignorar.
 * - Botón secundario "🧠 Segunda opinión Opus" para regenerar con Opus.
 *
 * El record persistido permite auditoría (qué propuso, qué hizo el fisio).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

type Output = {
  resumenEstado: string;
  propuesta: string;
  razonamiento: string;
  flags: string[];
  alternativas: string[];
};

export function LoadReviewSuggestionPanel({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [output, setOutput] = useState<Output | null>(null);
  const [tokens, setTokens] = useState<{ input?: number; output?: number }>({});
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [closing, setClosing] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  async function ask(modelChoice: "claude-sonnet-4-6" | "claude-opus-4-7") {
    setLoading(true);
    setError(null);
    setOutput(null);
    setDoneMsg(null);
    try {
      const r = await fetch("/api/load-review/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, model: modelChoice }),
      });
      // Soporta respuesta sin body (504 timeout de Vercel) o no-JSON.
      const text = await r.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch {}
      if (!r.ok) {
        const msg = data?.error
          ?? (r.status === 504
                ? "La sugerencia tardó demasiado (timeout). Si tienes un PDF muy grande, la 1ª llamada del día puede pasarse de tiempo; vuelve a intentarlo en 30s y debería ir mucho más rápido (caché)."
                : `Error ${r.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
        throw new Error(msg);
      }
      if (!data) throw new Error("Respuesta vacía del servidor");
      setRecordId(data.recordId);
      setModel(data.model);
      setOutput(data.output);
      setTokens({ input: data.inputTokens, output: data.outputTokens });
      setEditText(data.output?.propuesta ?? "");
    } catch (e: any) {
      setError(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  async function decide(decision: "apply" | "edit" | "ignore") {
    if (!recordId) return;
    setClosing(true);
    try {
      await fetch("/api/load-review/record", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId,
          decision,
          appliedNotes: decision === "edit" ? editText : decision === "apply" ? output?.propuesta : null,
        }),
      });
      setDoneMsg(
        decision === "apply" ? "✓ Aplicada tal cual. Paciente marcado como revisado."
        : decision === "edit" ? "✓ Aplicada con tus cambios. Paciente marcado como revisado."
        : "❌ Sugerencia descartada. No se ha tocado nada."
      );
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
          onClick={() => { setDoneMsg(null); setOutput(null); setRecordId(null); setEditing(false); }}
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
              La IA propone un borrador basado en anamnesis, onboarding e histórico de 4 semanas. Tú decides si lo aplicas, lo editas o lo ignoras.
            </p>
          </div>
          <button
            onClick={() => ask("claude-sonnet-4-6")}
            disabled={loading}
            className="btn btn-primary text-xs whitespace-nowrap"
          >
            {loading ? "Pensando…" : "💡 Sugerir control"}
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-700 mt-2">⚠️ {error}</p>
        )}
      </section>
    );
  }

  return (
    <section className="card border-amber-200 bg-amber-50/30">
      <header className="flex justify-between items-start gap-2 flex-wrap mb-3">
        <div>
          <h2 className="font-medium text-sm">🧠 Sugerencia IA</h2>
          <p className="text-[10px] text-neutral-500">
            Modelo: {model === "claude-opus-4-7" ? "Opus 4.7" : "Sonnet 4.6"}
            {tokens.input && tokens.output && (
              <> · {tokens.input} in / {tokens.output} out tokens</>
            )}
          </p>
        </div>
        <button
          onClick={() => ask("claude-opus-4-7")}
          disabled={loading || closing}
          className="text-xs text-neutral-600 underline"
          title="Reemplaza esta sugerencia por la que daría Opus 4.7 (más caro pero mejor razonamiento)"
        >
          {loading ? "…" : "🧠 Segunda opinión Opus"}
        </button>
      </header>

      <div className="space-y-3">
        <Block label="Resumen del estado" text={output.resumenEstado} />

        <div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Propuesta</div>
          {!editing ? (
            <p className="text-sm whitespace-pre-wrap font-medium text-neutral-900">{output.propuesta}</p>
          ) : (
            <textarea
              className="input min-h-[100px] text-sm"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              autoFocus
            />
          )}
        </div>

        <Block label="Razonamiento" text={output.razonamiento} muted />

        {output.flags.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-amber-700 mb-1">⚠ Flags</div>
            <ul className="text-xs text-amber-900 space-y-0.5">
              {output.flags.map((f, i) => <li key={i}>· {f}</li>)}
            </ul>
          </div>
        )}

        {output.alternativas.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Alternativas</div>
            <ul className="text-xs text-neutral-700 space-y-0.5">
              {output.alternativas.map((a, i) => <li key={i}>· {a}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-4 flex-wrap">
        {!editing ? (
          <>
            <button
              onClick={() => decide("apply")}
              disabled={closing}
              className="btn btn-primary text-xs"
            >
              ✓ Aplicar tal cual
            </button>
            <button
              onClick={() => setEditing(true)}
              disabled={closing}
              className="btn text-xs border border-neutral-300 bg-white"
            >
              ✏️ Editar y aplicar
            </button>
            <button
              onClick={() => decide("ignore")}
              disabled={closing}
              className="btn text-xs text-red-700 border border-red-200 bg-white"
            >
              ❌ Ignorar
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => decide("edit")}
              disabled={closing || !editText.trim()}
              className="btn btn-primary text-xs"
            >
              ✓ Guardar mi versión
            </button>
            <button
              onClick={() => { setEditing(false); setEditText(output.propuesta); }}
              disabled={closing}
              className="btn text-xs border border-neutral-300 bg-white"
            >
              Cancelar
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function Block({ label, text, muted = false }: { label: string; text: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">{label}</div>
      <p className={`text-sm whitespace-pre-wrap ${muted ? "text-neutral-600" : "text-neutral-900"}`}>{text}</p>
    </div>
  );
}
