"use client";

import { useState } from "react";

type GeneratedBlock = { label: string; content: string };
type GenerateOutput = {
  blocks: GeneratedBlock[];
  hookVariations: string[];
  cta: string;
  ctaUrlSuggestion: string;
};

/**
 * Modal "Generar guion con IA" para Anuncios.
 *
 * Misma estructura que el de Contenido (form → loading → preview con iteración
 * y bloque de "enseñar a la IA") pero adaptado a anuncios:
 *  - Resultado en `blocks` (Hook, Desarrollo, Cierre, ...) que al aplicar
 *    se concatenan en el campo `script` del Ad.
 *  - Devuelve también `cta` y `ctaUrlSuggestion` que se aplican a sus campos.
 *  - El bloque "Enseña a la IA" alimenta el AiAdsBrief (independiente del de
 *    Contenido).
 */
export function AdsAiGenerateModal({
  adId,
  initialHook,
  existingScript,
  existingCta,
  existingCtaUrl,
  onClose,
  onApply,
}: {
  adId: string;
  initialHook: string;
  existingScript: string;
  existingCta: string;
  existingCtaUrl: string;
  onClose: () => void;
  onApply: (patch: { hook?: string; script?: string; cta?: string; ctaUrl?: string }) => void;
}) {
  const [step, setStep] = useState<"form" | "loading" | "preview" | "error">("form");
  const [instructions, setInstructions] = useState("");
  const [hook, setHook] = useState(initialHook);
  const [freeNote, setFreeNote] = useState("");
  const [result, setResult] = useState<GenerateOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickedHookVariation, setPickedHookVariation] = useState<string | null>(null);

  // Iteración
  const [iterationInstruction, setIterationInstruction] = useState("");
  const [lastIterationApplied, setLastIterationApplied] = useState("");

  // "Enseña a la IA"
  const [learnAction, setLearnAction] = useState<"good" | "bad" | "rule" | null>(null);
  const [learnNote, setLearnNote] = useState("");
  const [learnSaving, setLearnSaving] = useState(false);
  const [learnSavedMsg, setLearnSavedMsg] = useState<string | null>(null);

  async function generate(iterate = false) {
    if (!iterate && !instructions.trim()) {
      setError("Necesitas darle instrucciones para que sepa qué anuncio generar.");
      return;
    }
    if (iterate && (!iterationInstruction.trim() || !result)) return;
    setError(null);
    setStep("loading");
    try {
      const res = await fetch("/api/ads/ads/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId,
          instructions: instructions.trim(),
          hook: hook.trim() || null,
          freeNote: freeNote.trim() || null,
          previousResult: iterate ? result : null,
          iterationInstruction: iterate ? iterationInstruction.trim() : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as GenerateOutput;
      setResult(data);
      setPickedHookVariation(null);
      if (iterate) setLastIterationApplied(iterationInstruction.trim());
      setIterationInstruction("");
      setLearnAction(null);
      setLearnNote("");
      setLearnSavedMsg(null);
      setStep("preview");
    } catch (e: any) {
      setError(e?.message || "Error generando guion");
      setStep("error");
    }
  }

  /** Concatena los bloques en un único string `script`. */
  function blocksToScript(blocks: GeneratedBlock[]): string {
    return blocks
      .map((b) => `[${b.label}]\n${b.content.trim()}`)
      .join("\n\n");
  }

  function applyAll() {
    if (!result) return;
    onApply({
      hook: pickedHookVariation ?? hook.trim() ?? undefined,
      script: blocksToScript(result.blocks),
      cta: result.cta,
      ctaUrl: existingCtaUrl || result.ctaUrlSuggestion,
    });
    onClose();
  }

  function applyScriptOnly() {
    if (!result) return;
    onApply({
      hook: pickedHookVariation ?? hook.trim() ?? undefined,
      script: blocksToScript(result.blocks),
    });
    onClose();
  }

  function applyCtaOnly() {
    if (!result) return;
    onApply({
      cta: result.cta,
      ctaUrl: existingCtaUrl || result.ctaUrlSuggestion,
    });
    onClose();
  }

  // ─── Helpers de "Enseña a la IA" ───

  function formatResultForBrief(): string {
    if (!result) return "";
    const lines: string[] = [];
    const hookUsed = pickedHookVariation || hook.trim();
    if (hookUsed) lines.push(`Hook: "${hookUsed}"`);
    result.blocks.forEach((b) => {
      lines.push("");
      lines.push(`[${b.label}]`);
      lines.push(b.content.trim());
    });
    if (result.cta) {
      lines.push("");
      lines.push(`CTA: ${result.cta}`);
    }
    return lines.join("\n");
  }

  function buildLearningContent(action: "good" | "bad" | "rule", note: string): string {
    const today = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
    if (action === "rule") {
      const rule = lastIterationApplied.trim();
      if (!rule) return note.trim();
      return [
        `- Preferencia (${today}): ${rule}`,
        note.trim() ? `  → ${note.trim()}` : "",
      ].filter(Boolean).join("\n");
    }
    const header = action === "good"
      ? `EJEMPLO BUENO (validado por CEO el ${today})`
      : `EJEMPLO MALO (rechazado por CEO el ${today})`;
    const footer = action === "good"
      ? `→ Por qué funciona: ${note.trim() || "(sin nota)"}`
      : `→ Qué chirría: ${note.trim() || "(sin nota)"}`;
    return [
      header,
      "",
      `Instrucciones que se le pasaron al modelo: ${instructions.trim() || "(no registradas)"}`,
      "",
      formatResultForBrief(),
      "",
      footer,
    ].join("\n");
  }

  async function saveLearning(action: "good" | "bad" | "rule") {
    if (!result) return;
    const section = action === "good" ? "goodExamples" : action === "bad" ? "badExamples" : "dos";
    const content = buildLearningContent(action, learnNote);
    if (!content.trim()) return;
    setLearnSaving(true);
    try {
      const res = await fetch("/api/ads/brief/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setLearnAction(null);
      setLearnNote("");
      setLearnSavedMsg(
        action === "good" ? "✓ Añadido a tus ejemplos buenos del Brief IA"
        : action === "bad" ? "✓ Añadido a tus ejemplos a evitar del Brief IA"
        : "✓ Convertido en preferencia general (sección 'Qué SÍ hacer')",
      );
      if (action === "rule") setLastIterationApplied("");
      setTimeout(() => setLearnSavedMsg(null), 4000);
    } catch (e: any) {
      setLearnSavedMsg(`⚠ Error: ${e?.message || "no se pudo guardar"}`);
    } finally {
      setLearnSaving(false);
    }
  }

  const hasExistingScript = !!existingScript.trim();
  const hasExistingCta = !!existingCta.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10, 10, 10, 0.55)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">✨ Generar guion de anuncio con IA</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Claude Opus 4.7 · respeta tu Brief IA de anuncios</p>
          </div>
          <button onClick={onClose} disabled={step === "loading"} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none px-2">×</button>
        </header>

        <div className="p-5 space-y-4">
          {step === "form" && (
            <>
              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1.5">
                  🎯 Instrucciones <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={4}
                  placeholder='Qué quieres que diga este anuncio. Audiencia, ángulo, dolor, oferta. Ej: "Mujeres 30-45 con dolor de hombro recurrente que llevan meses sin entrenar bien. Conecta con la frustración, desmonta el mito de descansar, y cierra con CTA a videoconsulta gratuita."'
                  className="w-full text-sm p-3 rounded-lg outline-none resize-y"
                  style={{ background: "#FAFAFA", border: "1px solid #D4D4D4" }}
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Cuanto más concreto, mejor te entiende: tono, ángulo, qué decir y qué evitar.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1.5">⚡ Hook (opcional)</label>
                <textarea
                  value={hook}
                  onChange={(e) => setHook(e.target.value)}
                  rows={2}
                  placeholder="Si tienes una frase de apertura clara, escríbela. La IA la usará TEXTUAL al inicio."
                  className="w-full text-sm p-3 rounded-lg outline-none resize-y"
                  style={{ background: "#FAFAFA", border: "1px solid #D4D4D4" }}
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Si la rellenas, se usa <strong>literal</strong>. La IA además te propondrá 3-4 variaciones.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1.5">📝 Nota / ajuste de tono (opcional)</label>
                <textarea
                  value={freeNote}
                  onChange={(e) => setFreeNote(e.target.value)}
                  rows={2}
                  placeholder='Ej. "más corto", "menos académico", "más directo", "tono cercano sin perder seriedad"…'
                  className="w-full text-sm p-3 rounded-lg outline-none resize-y"
                  style={{ background: "#FAFAFA", border: "1px solid #D4D4D4" }}
                />
              </div>

              {error && (
                <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B" }}>
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                <button onClick={onClose} className="text-sm text-neutral-500 px-3 py-2">Cancelar</button>
                <button onClick={() => generate(false)} className="text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: "#0A0A0A", color: "#FAFAFA" }}>
                  ✨ Generar guion
                </button>
              </div>
            </>
          )}

          {step === "loading" && (
            <div className="py-10 text-center">
              <div className="inline-block animate-spin text-3xl mb-3">⚡</div>
              <p className="text-sm font-medium">Generando con Opus 4.7…</p>
              <p className="text-xs text-neutral-500 mt-1">Tarda 15-40 segundos. No cierres esta ventana.</p>
            </div>
          )}

          {step === "error" && (
            <div className="py-6">
              <div className="rounded-lg p-4 mb-4" style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B" }}>
                <p className="text-sm font-medium mb-1">No se pudo generar</p>
                <p className="text-xs">{error}</p>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="text-sm text-neutral-500 px-3 py-2">Cerrar</button>
                <button onClick={() => setStep("form")} className="text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: "#0A0A0A", color: "#FAFAFA" }}>Reintentar</button>
              </div>
            </div>
          )}

          {step === "preview" && result && (
            <>
              {result.hookVariations.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-neutral-700 mb-2">Variaciones de hook</h3>
                  <div className="space-y-1.5">
                    {result.hookVariations.map((v, i) => {
                      const picked = pickedHookVariation === v;
                      return (
                        <button
                          key={i}
                          onClick={() => setPickedHookVariation(picked ? null : v)}
                          className="block w-full text-left text-sm rounded-lg px-3 py-2 transition-colors"
                          style={{ background: picked ? "#FEF3C7" : "#FAFAFA", border: `1px solid ${picked ? "#F59E0B" : "#E5E5E5"}` }}
                        >
                          <span className="font-medium">{picked ? "✓ " : ""}{v}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1.5">Click para usar esa variación como hook al aplicar.</p>
                </section>
              )}

              <section>
                <h3 className="text-xs font-semibold text-neutral-700 mb-2">Bloques del guion</h3>
                <div className="space-y-2">
                  {result.blocks.map((b, i) => (
                    <div key={i} className="rounded-lg p-3" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold mb-1.5">{b.label}</div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{b.content}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Bloque CTA (específico de Ads) */}
              <section>
                <h3 className="text-xs font-semibold text-neutral-700 mb-2">📣 CTA del anuncio</h3>
                <div className="rounded-lg p-3" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
                  <p className="text-sm font-medium text-emerald-900">{result.cta}</p>
                  {result.ctaUrlSuggestion && (
                    <p className="text-[11px] text-emerald-700 mt-1 break-all">
                      URL sugerida: <code className="bg-white px-1 rounded">{result.ctaUrlSuggestion}</code>
                    </p>
                  )}
                </div>
              </section>

              {(hasExistingScript || hasExistingCta) && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#FEF3C7", border: "1px solid #FCD34D", color: "#78350F" }}>
                  ⚠ Este anuncio ya tenía contenido. Si aplicas, lo sobrescribes.
                </div>
              )}

              {/* Enseña a la IA — alimenta AiAdsBrief */}
              <section className="rounded-xl p-3" style={{ background: "#F5F3FF", border: "1px solid #DDD6FE" }}>
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <h3 className="text-xs font-semibold" style={{ color: "#5B21B6" }}>🧠 Enseña a la IA (alimenta tu Brief IA de anuncios)</h3>
                  {learnSavedMsg && <span className="text-[11px] font-medium" style={{ color: "#15803D" }}>{learnSavedMsg}</span>}
                </div>
                <p className="text-[11px] mb-2" style={{ color: "#6D28D9" }}>
                  Cada vez que añades un ejemplo o una regla, las siguientes generaciones tienen más contexto. No "entrena" el modelo — afina tu prompt.
                </p>

                {learnAction === null && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setLearnAction("good")} className="text-xs px-3 py-2 rounded-lg font-medium" style={{ background: "#FFFFFF", border: "1px solid #A78BFA", color: "#5B21B6" }}>
                      ⭐ Está clavadísimo · súmalo a buenos ejemplos
                    </button>
                    <button type="button" onClick={() => setLearnAction("bad")} className="text-xs px-3 py-2 rounded-lg font-medium" style={{ background: "#FFFFFF", border: "1px solid #A78BFA", color: "#5B21B6" }}>
                      ❌ No me sirve · súmalo a evitar
                    </button>
                    {lastIterationApplied.trim() && (
                      <button type="button" onClick={() => setLearnAction("rule")} className="text-xs px-3 py-2 rounded-lg font-medium" style={{ background: "#FFFFFF", border: "1px solid #A78BFA", color: "#5B21B6" }} title={`Convertir "${lastIterationApplied}" en preferencia general`}>
                        📝 Convertir mi último ajuste en regla
                      </button>
                    )}
                  </div>
                )}

                {learnAction !== null && (
                  <div>
                    <label className="text-[11px] font-semibold block mb-1.5" style={{ color: "#5B21B6" }}>
                      {learnAction === "good" && "¿Por qué funciona este guion? Una frase explicándolo."}
                      {learnAction === "bad" && "¿Qué chirría exactamente? Una frase explicándolo."}
                      {learnAction === "rule" && (
                        <>Convertir el ajuste <span className="font-mono italic">"{lastIterationApplied}"</span> en preferencia general. (Opcional) Comentario:</>
                      )}
                    </label>
                    <textarea
                      value={learnNote}
                      onChange={(e) => setLearnNote(e.target.value)}
                      rows={2}
                      placeholder={
                        learnAction === "good" ? 'Ej. "El ángulo del dolor conecta muy bien"'
                        : learnAction === "bad" ? 'Ej. "El cierre suena cliché"'
                        : 'Ej. "Aplicable a todos los Reels de anuncios"'
                      }
                      className="w-full text-xs p-2.5 rounded-lg outline-none resize-y"
                      style={{ background: "#FFFFFF", border: "1px solid #C4B5FD" }}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button type="button" onClick={() => { setLearnAction(null); setLearnNote(""); }} disabled={learnSaving} className="text-xs px-3 py-1.5" style={{ color: "#6D28D9" }}>Cancelar</button>
                      <button type="button" onClick={() => saveLearning(learnAction!)} disabled={learnSaving || (learnAction !== "rule" && !learnNote.trim())} className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: "#6D28D9", color: "#FFFFFF" }}>
                        {learnSaving ? "Guardando…" : "Guardar en mi Brief"}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Iteración */}
              <section className="rounded-xl p-3" style={{ background: "#FFFBEB", border: "1px dashed #FCD34D" }}>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "#78350F" }}>🔁 ¿Quieres ajustar el resultado?</label>
                <textarea
                  value={iterationInstruction}
                  onChange={(e) => setIterationInstruction(e.target.value)}
                  rows={2}
                  placeholder='Ej. "Más corto", "cambia el cierre por un CTA más urgente", "menos académico"…'
                  className="w-full text-sm p-2.5 rounded-lg outline-none resize-y"
                  style={{ background: "#FFFFFF", border: "1px solid #FCD34D" }}
                />
                <div className="flex justify-end mt-2">
                  <button type="button" onClick={() => generate(true)} disabled={!iterationInstruction.trim()} className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)", color: "#0A0A0A" }}>
                    🔁 Regenerar con este ajuste
                  </button>
                </div>
                <p className="text-[11px] mt-2" style={{ color: "#78350F" }}>
                  Ajusta la versión actual manteniendo lo que funciona. Itera las veces que necesites.
                </p>
              </section>

              {/* Acciones */}
              <div className="flex justify-between gap-2 pt-2 border-t border-neutral-100 flex-wrap">
                <button onClick={onClose} className="text-sm text-neutral-500 px-3 py-2">Descartar</button>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={applyCtaOnly} className="text-sm px-3 py-2 rounded-lg border border-neutral-300 hover:bg-neutral-50">Solo CTA</button>
                  <button onClick={applyScriptOnly} className="text-sm px-3 py-2 rounded-lg border border-neutral-300 hover:bg-neutral-50">Solo guion</button>
                  <button onClick={applyAll} className="text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: "#0A0A0A", color: "#FAFAFA" }}>
                    Aplicar todo
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
