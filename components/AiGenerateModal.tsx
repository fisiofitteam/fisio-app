"use client";

import { useEffect, useState } from "react";

type Block = { id: string; label: string; content: string; order: number };

type Template = {
  id: string;
  name: string;
  description: string | null;
  blocks: Array<{ id: string; label: string; order: number }>;
};

type GeneratedBlock = { label: string; content: string };
type GenerateOutput = {
  blocks: GeneratedBlock[];
  caption: string;
  hookVariations: string[];
};

/**
 * Modal "Generar guion con IA".
 *
 * Flujo:
 *  1. Estado "form": el usuario confirma el hook, elige plantilla (opcional),
 *     opcionalmente añade una nota libre ("hazlo más corto").
 *  2. Click "Generar" → estado "loading" mientras Opus genera.
 *  3. Estado "preview": muestra el resultado side-by-side y deja aplicar
 *     todo, solo blocks, solo caption, o descartar.
 */
export function AiGenerateModal({
  pieceId,
  format,
  initialHook,
  existingBlocks,
  existingCaption,
  onClose,
  onApply,
}: {
  pieceId: string;
  format: string;
  initialHook: string;
  existingBlocks: Block[];
  existingCaption: string | null;
  onClose: () => void;
  onApply: (patch: {
    hook?: string;
    blocks?: Block[];
    caption?: string;
  }) => void;
}) {
  const [step, setStep] = useState<"form" | "loading" | "preview" | "error">("form");
  const [instructions, setInstructions] = useState("");
  const [hook, setHook] = useState(initialHook);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [scriptTemplateId, setScriptTemplateId] = useState<string>("");
  const [freeNote, setFreeNote] = useState("");
  const [result, setResult] = useState<GenerateOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickedHookVariation, setPickedHookVariation] = useState<string | null>(null);
  /** Caja de "pídeme un ajuste" que aparece en el preview tras generar. */
  const [iterationInstruction, setIterationInstruction] = useState("");
  /** Última iteración aplicada con éxito — la usamos para el botón
   *  "convertir mi iteración en regla del brief". */
  const [lastIterationApplied, setLastIterationApplied] = useState("");
  /** Estado del bloque "enseñar a la IA": qué acción activa, qué nota
   *  está escribiendo, si está guardando, último mensaje de confirmación. */
  const [learnAction, setLearnAction] = useState<"good" | "bad" | "rule" | null>(null);
  const [learnNote, setLearnNote] = useState("");
  const [learnSaving, setLearnSaving] = useState(false);
  const [learnSavedMsg, setLearnSavedMsg] = useState<string | null>(null);

  // Cargar plantillas del formato
  useEffect(() => {
    let alive = true;
    fetch(`/api/script-templates?format=${encodeURIComponent(format)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        setTemplates(data?.templates || []);
      })
      .catch(() => {
        if (alive) setTemplates([]);
      });
    return () => {
      alive = false;
    };
  }, [format]);

  /**
   * Llama al endpoint de generación. Si `iterate` es true, manda también la
   * versión anterior (this.result) y la instrucción de ajuste, para que la
   * IA refine en vez de generar desde cero.
   */
  async function generate(iterate = false) {
    if (!instructions.trim()) {
      setError("Necesitas darle instrucciones para que sepa qué pieza generar.");
      return;
    }
    if (iterate && (!iterationInstruction.trim() || !result)) return;
    setError(null);
    setStep("loading");
    try {
      const res = await fetch("/api/contenido/ia/generar-guion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pieceId,
          instructions: instructions.trim(),
          hook: hook.trim() || null,
          scriptTemplateId: scriptTemplateId || null,
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
      // Si era una iteración exitosa, recordamos cuál fue por si quiere
      // convertirla en regla del brief; limpiamos la caja para la próxima.
      if (iterate) setLastIterationApplied(iterationInstruction.trim());
      setIterationInstruction("");
      // Reset del bloque de aprendizaje al cambiar de resultado.
      setLearnAction(null);
      setLearnNote("");
      setLearnSavedMsg(null);
      setStep("preview");
    } catch (e: any) {
      setError(e?.message || "Error generando guion");
      setStep("error");
    }
  }

  function applyAll() {
    if (!result) return;
    onApply({
      hook: pickedHookVariation ? pickedHookVariation : undefined,
      blocks: mergeBlocks(existingBlocks, result.blocks),
      caption: result.caption,
    });
    onClose();
  }

  function applyBlocksOnly() {
    if (!result) return;
    onApply({
      hook: pickedHookVariation ? pickedHookVariation : undefined,
      blocks: mergeBlocks(existingBlocks, result.blocks),
    });
    onClose();
  }

  function applyCaptionOnly() {
    if (!result) return;
    onApply({
      hook: pickedHookVariation ? pickedHookVariation : undefined,
      caption: result.caption,
    });
    onClose();
  }

  // ─── Helpers de "enseñar a la IA" (alimentar el Brief IA) ───

  /**
   * Formatea el guion generado en texto plano para añadirlo como ejemplo
   * al brief. Mantiene labels y orden de los bloques. Incluye también el
   * hook usado y el caption si lo hay.
   */
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
    if (result.caption?.trim()) {
      lines.push("");
      lines.push(`Caption: ${result.caption.trim()}`);
    }
    return lines.join("\n");
  }

  /**
   * Construye el bloque de texto que se añade al brief según la acción.
   * Incluye fecha + instrucciones que dieron al modelo + el guion (en buenos
   * y malos) + la nota explicativa del CEO. Para "rule" sólo añade la
   * iteración como preferencia general.
   */
  function buildLearningContent(
    action: "good" | "bad" | "rule",
    note: string
  ): string {
    const today = new Date().toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    if (action === "rule") {
      const rule = lastIterationApplied.trim();
      if (!rule) return note.trim();
      return [
        `- Preferencia (${today}): ${rule}`,
        note.trim() ? `  → ${note.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    const header =
      action === "good"
        ? `EJEMPLO BUENO (validado por CEO el ${today})`
        : `EJEMPLO MALO (rechazado por CEO el ${today})`;
    const footer =
      action === "good"
        ? `→ Por qué funciona: ${note.trim() || "(sin nota — el CEO no añadió comentario)"}`
        : `→ Qué chirría: ${note.trim() || "(sin nota — el CEO no añadió comentario)"}`;
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
    const section =
      action === "good" ? "goodExamples" : action === "bad" ? "badExamples" : "dos";
    const content = buildLearningContent(action, learnNote);
    if (!content.trim()) return;

    setLearnSaving(true);
    try {
      const res = await fetch("/api/contenido/brief-ia/append", {
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
        action === "good"
          ? "✓ Añadido a tus ejemplos buenos del Brief IA"
          : action === "bad"
          ? "✓ Añadido a tus ejemplos a evitar del Brief IA"
          : "✓ Convertido en preferencia general (sección 'Qué SÍ hago')"
      );
      // Si convertimos la iteración en regla, ya no debería volver a
      // ofrecerse el botón hasta la próxima iteración.
      if (action === "rule") setLastIterationApplied("");
      setTimeout(() => setLearnSavedMsg(null), 4000);
    } catch (e: any) {
      setLearnSavedMsg(`⚠ Error: ${e?.message || "no se pudo guardar"}`);
    } finally {
      setLearnSaving(false);
    }
  }

  const hasExistingBlockContent = existingBlocks.some((b) => b.content.trim());
  const hasExistingCaption = !!existingCaption?.trim();

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
        <header className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              ✨ Generar guion con IA
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Claude Opus 4.7 · respeta tu Brief IA + plantilla + piezas top
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 text-xl leading-none px-2"
            disabled={step === "loading"}
          >
            ×
          </button>
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
                  placeholder='Qué quieres que diga esta pieza. Tema, ángulo, mensaje. Ej: "Quiero hablar de por qué la mayoría de fisios tratan mal el dolor de hombro en crossfit. Desmonta el mito de que es sobreentrenamiento, cuenta lo que realmente vemos en consulta (impingement por mala mecánica), y cierra con un test de 10 segundos que puedan hacer ahora mismo."'
                  className="w-full text-sm p-3 rounded-lg outline-none resize-y"
                  style={{ background: "#FAFAFA", border: "1px solid #D4D4D4" }}
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Lo más importante. Cuanto más concreto, mejor te entiende. Tono, ángulo, qué decir y qué evitar.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1.5">
                  ⚡ Hook (opcional)
                </label>
                <textarea
                  value={hook}
                  onChange={(e) => setHook(e.target.value)}
                  rows={2}
                  placeholder="Si tienes una frase de apertura clara, escríbela. La IA la usará TEXTUAL al inicio del guion. Si no la tienes, la propondrá ella."
                  className="w-full text-sm p-3 rounded-lg outline-none resize-y"
                  style={{ background: "#FAFAFA", border: "1px solid #D4D4D4" }}
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Si la rellenas, se usa <strong>literal</strong> palabra por palabra. La IA además te propondrá 3 variaciones por si quieres probar.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1.5">
                  🧩 Estructura (opcional)
                </label>
                <select
                  value={scriptTemplateId}
                  onChange={(e) => setScriptTemplateId(e.target.value)}
                  className="w-full text-sm p-2.5 rounded-lg outline-none"
                  style={{ background: "#FAFAFA", border: "1px solid #D4D4D4" }}
                >
                  <option value="">— Sin plantilla, libre —</option>
                  {(templates ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.description ? ` · ${t.description}` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Si eliges plantilla, la IA respeta sus bloques. Sin plantilla, ella propone la estructura libre según tus instrucciones.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1.5">
                  📝 Nota / ajuste de tono (opcional)
                </label>
                <textarea
                  value={freeNote}
                  onChange={(e) => setFreeNote(e.target.value)}
                  rows={2}
                  placeholder='Ej. "más corto", "menos académico", "remata con una pregunta provocadora"…'
                  className="w-full text-sm p-3 rounded-lg outline-none resize-y"
                  style={{ background: "#FAFAFA", border: "1px solid #D4D4D4" }}
                />
              </div>

              {error && (
                <div
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B" }}
                >
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                <button onClick={onClose} className="text-sm text-neutral-500 px-3 py-2">
                  Cancelar
                </button>
                <button
                  onClick={() => generate(false)}
                  className="text-sm font-semibold px-4 py-2 rounded-lg"
                  style={{ background: "#0A0A0A", color: "#FAFAFA" }}
                >
                  ✨ Generar guion
                </button>
              </div>
            </>
          )}

          {step === "loading" && (
            <div className="py-10 text-center">
              <div className="inline-block animate-spin text-3xl mb-3">⚡</div>
              <p className="text-sm font-medium">Generando con Opus 4.7…</p>
              <p className="text-xs text-neutral-500 mt-1">
                Tarda 15-40 segundos. No cierres esta ventana.
              </p>
            </div>
          )}

          {step === "error" && (
            <div className="py-6">
              <div
                className="rounded-lg p-4 mb-4"
                style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B" }}
              >
                <p className="text-sm font-medium mb-1">No se pudo generar</p>
                <p className="text-xs">{error}</p>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="text-sm text-neutral-500 px-3 py-2">
                  Cerrar
                </button>
                <button
                  onClick={() => setStep("form")}
                  className="text-sm font-semibold px-4 py-2 rounded-lg"
                  style={{ background: "#0A0A0A", color: "#FAFAFA" }}
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {step === "preview" && result && (
            <>
              {result.hookVariations.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-neutral-700 mb-2">
                    Variaciones de hook (3 alternativas más fuertes)
                  </h3>
                  <div className="space-y-1.5">
                    {result.hookVariations.map((v, i) => {
                      const picked = pickedHookVariation === v;
                      return (
                        <button
                          key={i}
                          onClick={() => setPickedHookVariation(picked ? null : v)}
                          className="block w-full text-left text-sm rounded-lg px-3 py-2 transition-colors"
                          style={{
                            background: picked ? "#FEF3C7" : "#FAFAFA",
                            border: `1px solid ${picked ? "#F59E0B" : "#E5E5E5"}`,
                          }}
                        >
                          <span className="font-medium">
                            {picked ? "✓ " : ""}
                            {v}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1.5">
                    Click para usar esa variación como hook nuevo al aplicar.
                  </p>
                </section>
              )}

              <section>
                <h3 className="text-xs font-semibold text-neutral-700 mb-2">Bloques del guion</h3>
                <div className="space-y-2">
                  {result.blocks.map((b, i) => (
                    <div
                      key={i}
                      className="rounded-lg p-3"
                      style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}
                    >
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold mb-1.5">
                        {b.label}
                      </div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{b.content}</p>
                    </div>
                  ))}
                </div>
              </section>

              {result.caption && (
                <section>
                  <h3 className="text-xs font-semibold text-neutral-700 mb-2">Caption</h3>
                  <div
                    className="rounded-lg p-3 text-sm whitespace-pre-wrap leading-relaxed"
                    style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}
                  >
                    {result.caption}
                  </div>
                </section>
              )}

              {(hasExistingBlockContent || hasExistingCaption) && (
                <div
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{ background: "#FEF3C7", border: "1px solid #FCD34D", color: "#78350F" }}
                >
                  ⚠ Esta pieza ya tenía contenido. Si aplicas, lo sobrescribes.
                </div>
              )}

              {/* Bloque "enseñar a la IA": 3 botones que alimentan el Brief IA. */}
              <section
                className="rounded-xl p-3"
                style={{ background: "#F5F3FF", border: "1px solid #DDD6FE" }}
              >
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <h3 className="text-xs font-semibold" style={{ color: "#5B21B6" }}>
                    🧠 Enseña a la IA (alimenta tu Brief)
                  </h3>
                  {learnSavedMsg && (
                    <span className="text-[11px] font-medium" style={{ color: "#15803D" }}>
                      {learnSavedMsg}
                    </span>
                  )}
                </div>
                <p className="text-[11px] mb-2" style={{ color: "#6D28D9" }}>
                  Cada vez que añades un ejemplo o una regla, las siguientes generaciones tienen más contexto. No "entrena" el modelo — afina tu prompt.
                </p>

                {learnAction === null && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setLearnAction("good")}
                      className="text-xs px-3 py-2 rounded-lg font-medium"
                      style={{ background: "#FFFFFF", border: "1px solid #A78BFA", color: "#5B21B6" }}
                    >
                      ⭐ Está clavadísimo · súmalo a buenos ejemplos
                    </button>
                    <button
                      type="button"
                      onClick={() => setLearnAction("bad")}
                      className="text-xs px-3 py-2 rounded-lg font-medium"
                      style={{ background: "#FFFFFF", border: "1px solid #A78BFA", color: "#5B21B6" }}
                    >
                      ❌ No me sirve · súmalo a evitar
                    </button>
                    {lastIterationApplied.trim() && (
                      <button
                        type="button"
                        onClick={() => setLearnAction("rule")}
                        className="text-xs px-3 py-2 rounded-lg font-medium"
                        style={{ background: "#FFFFFF", border: "1px solid #A78BFA", color: "#5B21B6" }}
                        title={`Convertir "${lastIterationApplied}" en preferencia general del brief`}
                      >
                        📝 Convertir mi último ajuste en regla
                      </button>
                    )}
                  </div>
                )}

                {learnAction !== null && (
                  <div>
                    <label
                      className="text-[11px] font-semibold block mb-1.5"
                      style={{ color: "#5B21B6" }}
                    >
                      {learnAction === "good" && "¿Por qué funciona este guion? Una frase explicándolo."}
                      {learnAction === "bad" && "¿Qué chirría exactamente? Una frase explicándolo."}
                      {learnAction === "rule" && (
                        <>
                          Convertir el ajuste{" "}
                          <span className="font-mono italic">"{lastIterationApplied}"</span> en
                          preferencia general. (Opcional) Comentario extra:
                        </>
                      )}
                    </label>
                    <textarea
                      value={learnNote}
                      onChange={(e) => setLearnNote(e.target.value)}
                      rows={2}
                      placeholder={
                        learnAction === "good"
                          ? 'Ej. "El ritmo del bloque del porqué conecta muy bien con la analogía del snatch"'
                          : learnAction === "bad"
                          ? 'Ej. "El cierre suena cliché, no es mi voz"'
                          : 'Ej. "Vale para reels en general, no solo este caso"'
                      }
                      className="w-full text-xs p-2.5 rounded-lg outline-none resize-y"
                      style={{ background: "#FFFFFF", border: "1px solid #C4B5FD" }}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setLearnAction(null);
                          setLearnNote("");
                        }}
                        className="text-xs px-3 py-1.5"
                        style={{ color: "#6D28D9" }}
                        disabled={learnSaving}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => saveLearning(learnAction!)}
                        disabled={learnSaving || (learnAction !== "rule" && !learnNote.trim())}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: "#6D28D9", color: "#FFFFFF", border: "none" }}
                      >
                        {learnSaving ? "Guardando…" : "Guardar en mi Brief"}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Caja de iteración: pide ajustes sobre el resultado anterior */}
              <section
                className="rounded-xl p-3"
                style={{ background: "#FFFBEB", border: "1px dashed #FCD34D" }}
              >
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "#78350F" }}>
                  🔁 ¿Quieres ajustar el resultado?
                </label>
                <textarea
                  value={iterationInstruction}
                  onChange={(e) => setIterationInstruction(e.target.value)}
                  rows={2}
                  placeholder='Ej. "Hazlo más corto", "menos académico", "cambia el cierre por un CTA más directo a DM con la palabra HOMBRO"…'
                  className="w-full text-sm p-2.5 rounded-lg outline-none resize-y"
                  style={{ background: "#FFFFFF", border: "1px solid #FCD34D" }}
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => generate(true)}
                    disabled={!iterationInstruction.trim()}
                    className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
                      color: "#0A0A0A",
                      border: "none",
                    }}
                  >
                    🔁 Regenerar con este ajuste
                  </button>
                </div>
                <p className="text-[11px] mt-2" style={{ color: "#78350F" }}>
                  La IA ajustará la versión actual manteniendo lo que funciona. Puedes iterar las veces que necesites antes de aplicar.
                </p>
              </section>

              <div className="flex justify-between gap-2 pt-2 border-t border-neutral-100 flex-wrap">
                <button onClick={onClose} className="text-sm text-neutral-500 px-3 py-2">
                  Descartar
                </button>
                <div className="flex gap-2 flex-wrap">
                  {result.caption && (
                    <button
                      onClick={applyCaptionOnly}
                      className="text-sm px-3 py-2 rounded-lg border border-neutral-300 hover:bg-neutral-50"
                    >
                      Solo caption
                    </button>
                  )}
                  <button
                    onClick={applyBlocksOnly}
                    className="text-sm px-3 py-2 rounded-lg border border-neutral-300 hover:bg-neutral-50"
                  >
                    Solo bloques
                  </button>
                  <button
                    onClick={applyAll}
                    className="text-sm font-semibold px-4 py-2 rounded-lg"
                    style={{ background: "#0A0A0A", color: "#FAFAFA" }}
                  >
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

/**
 * Funde los bloques generados con los existentes manteniendo id/order.
 * Estrategia:
 *  1. Para cada bloque generado, si su label coincide con uno existente
 *     (case-insensitive trim), reemplazamos el content de ése preservando
 *     id y order.
 *  2. Si no encuentra match, lo añade al final con un id nuevo y order
 *     creciente.
 *  3. Los bloques existentes que no aparezcan en la generación se MANTIENEN
 *     (no los borramos, por si la IA olvidó alguno).
 */
function mergeBlocks(existing: Block[], generated: GeneratedBlock[]): Block[] {
  const used = new Set<string>();
  const result: Block[] = [];

  // Copia mutable de existentes para ir consumiendo matches
  const remaining = [...existing];

  for (const g of generated) {
    const norm = g.label.toLowerCase().trim();
    const idx = remaining.findIndex((e) => e.label.toLowerCase().trim() === norm);
    if (idx >= 0) {
      const found = remaining[idx];
      result.push({ ...found, label: g.label, content: g.content });
      used.add(found.id);
      remaining.splice(idx, 1);
    } else {
      const order = result.length > 0 ? result[result.length - 1].order + 1 : 0;
      result.push({
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: g.label,
        content: g.content,
        order,
      });
    }
  }

  // Mantener bloques existentes no matcheados al final (preservando su order)
  for (const r of remaining) {
    if (!used.has(r.id)) result.push(r);
  }

  // Renumerar order desde 0 para que quede limpio
  return result.map((b, i) => ({ ...b, order: i }));
}
