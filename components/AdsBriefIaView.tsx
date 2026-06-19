"use client";

import { useState } from "react";
import { OBJECTIVES, OBJECTIVE_LABELS, type AdObjective } from "@/lib/ads";

type Hook = { id: string; text: string };
type Audience = { id: string; name: string; description: string };

type Result = {
  hook?: string;
  script?: string;
  cta?: string;
  ctaUrlSuggestion?: string;
  alternativeHooks?: string[];
  raw?: string;
  _parseError?: boolean;
};

export function AdsBriefIaView({ hooks, audiences }: { hooks: Hook[]; audiences: Audience[] }) {
  const [objective, setObjective] = useState<AdObjective>("conversions");
  const [audienceText, setAudienceText] = useState("");
  const [hookSeed, setHookSeed] = useState("");
  const [durationSec, setDurationSec] = useState(30);
  const [productNotes, setProductNotes] = useState("");
  const [freeContext, setFreeContext] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function generate() {
    if (!audienceText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/ads/brief-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective,
          audience: audienceText,
          hookSeed,
          durationSec,
          productNotes,
          freeContext,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "No se ha podido generar");
      } else {
        setResult(data);
      }
    } catch (e: any) {
      setError(e.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="card space-y-3">
        <h2 className="font-medium text-sm">🤖 Genera guion con IA</h2>

        <div>
          <label className="text-xs text-neutral-500 block mb-1">Objetivo</label>
          <select className="input" value={objective} onChange={(e) => setObjective(e.target.value as AdObjective)}>
            {OBJECTIVES.map((o) => <option key={o} value={o}>{OBJECTIVE_LABELS[o]}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-neutral-500 block mb-1">Audiencia</label>
          <textarea
            className="input"
            rows={3}
            value={audienceText}
            onChange={(e) => setAudienceText(e.target.value)}
            placeholder="A quién va dirigido (edad, deporte, dolor, etc)"
          />
          {audiences.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[11px] text-neutral-400">Usar:</span>
              {audiences.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAudienceText(`${a.name}\n${a.description}`)}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-neutral-200 hover:bg-neutral-50"
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-neutral-500 block mb-1">Hook semilla (opcional)</label>
          <input className="input" value={hookSeed} onChange={(e) => setHookSeed(e.target.value)} placeholder="Una idea o frase de partida" />
          {hooks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[11px] text-neutral-400">Banco:</span>
              {hooks.slice(0, 6).map((h) => (
                <button
                  key={h.id}
                  onClick={() => setHookSeed(h.text)}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-neutral-200 hover:bg-neutral-50 max-w-[260px] truncate"
                  title={h.text}
                >
                  {h.text}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Duración aprox (s)</label>
            <input type="number" className="input" value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value) || 30)} min={5} max={120} />
          </div>
        </div>

        <div>
          <label className="text-xs text-neutral-500 block mb-1">Notas del producto (opcional)</label>
          <textarea className="input" rows={2} value={productNotes} onChange={(e) => setProductNotes(e.target.value)} placeholder="Beneficio principal, oferta, garantía…" />
        </div>

        <div>
          <label className="text-xs text-neutral-500 block mb-1">Contexto libre (opcional)</label>
          <textarea className="input" rows={3} value={freeContext} onChange={(e) => setFreeContext(e.target.value)} placeholder="Cualquier dato extra que la IA deba tener en cuenta" />
        </div>

        <button onClick={generate} disabled={!audienceText.trim() || loading} className="btn btn-primary w-full">
          {loading ? "Generando con Claude Opus…" : "✨ Generar guion"}
        </button>
      </section>

      <section className="card">
        <h2 className="font-medium text-sm mb-2">📜 Resultado</h2>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!result && !error && (
          <p className="text-xs text-neutral-400 italic">Rellena el formulario y pulsa Generar.</p>
        )}
        {result?._parseError && (
          <div>
            <p className="text-xs text-amber-700 mb-2">La IA no devolvió JSON limpio. Texto crudo:</p>
            <pre className="text-xs bg-neutral-50 p-3 rounded whitespace-pre-wrap">{result.raw}</pre>
          </div>
        )}
        {result && !result._parseError && (
          <div className="space-y-4 text-sm">
            {result.hook && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-xs uppercase text-neutral-500 font-medium">🎣 Hook principal</h3>
                  <button onClick={() => copy(result.hook!, "hook")} className="text-xs text-neutral-500">
                    {copied === "hook" ? "✓ Copiado" : "Copiar"}
                  </button>
                </div>
                <p className="bg-amber-50 p-2 rounded">{result.hook}</p>
              </div>
            )}
            {result.script && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-xs uppercase text-neutral-500 font-medium">📝 Guion</h3>
                  <button onClick={() => copy(result.script!, "script")} className="text-xs text-neutral-500">
                    {copied === "script" ? "✓ Copiado" : "Copiar"}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap text-sm bg-neutral-50 p-2 rounded">{result.script}</pre>
              </div>
            )}
            {result.cta && (
              <div>
                <h3 className="text-xs uppercase text-neutral-500 font-medium mb-1">📣 CTA</h3>
                <p className="bg-neutral-50 p-2 rounded">{result.cta}</p>
                {result.ctaUrlSuggestion && (
                  <p className="text-[11px] text-neutral-400 mt-1">URL sugerida: {result.ctaUrlSuggestion}</p>
                )}
              </div>
            )}
            {result.alternativeHooks && result.alternativeHooks.length > 0 && (
              <div>
                <h3 className="text-xs uppercase text-neutral-500 font-medium mb-1">🧪 Hooks alternativos</h3>
                <ul className="space-y-1">
                  {result.alternativeHooks.map((h, i) => (
                    <li key={i} className="flex justify-between items-start gap-2 bg-neutral-50 p-2 rounded">
                      <span className="flex-1">{h}</span>
                      <button onClick={() => copy(h, `alt-${i}`)} className="text-xs text-neutral-500">
                        {copied === `alt-${i}` ? "✓" : "Copiar"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
