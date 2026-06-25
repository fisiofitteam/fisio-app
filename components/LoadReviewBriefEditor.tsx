"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Editor del brief de control de cargas IA.
 *
 * UI simplificada: una sola caja libre. Todo lo que se escribe se persiste en
 * `methodology` (los otros campos del modelo se mantienen para compat).
 *
 * El brief completo (incluyendo reglas duras, ejemplos, etc.) lo redacta el
 * fisio con un prompt maestro externo y lo pega aquí entero.
 */
export function LoadReviewBriefEditor({
  initial,
}: {
  initial: { methodology: string; hardRules: string; goodExamples: string };
}) {
  // Si por compat hay contenido legacy en hardRules / goodExamples, lo
  // unimos al methodology la primera vez para no perderlo.
  const initialJoined = [initial.methodology, initial.hardRules, initial.goodExamples]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join("\n\n");

  const [content, setContent] = useState(initialJoined);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSave(next: string) {
    setSaving(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await fetch("/api/load-review/brief", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Mandamos todo en methodology y vaciamos los otros dos.
        body: JSON.stringify({ methodology: next, hardRules: "", goodExamples: "" }),
      });
      setSaving(false);
      if (r.ok) setSavedAt(new Date());
    }, 800);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div className="space-y-3">
      <div className="flex justify-end items-center text-[11px] text-neutral-400 min-h-[16px]">
        {saving ? "Guardando…" : savedAt ? `Guardado · ${savedAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : ""}
      </div>

      <section className="card">
        <textarea
          className="w-full min-h-[600px] font-mono text-xs leading-relaxed bg-transparent outline-none resize-y"
          value={content}
          onChange={(e) => { setContent(e.target.value); scheduleSave(e.target.value); }}
          placeholder="Pega aquí tu brief completo. La IA lo usará tal cual al sugerir controles de carga."
        />
      </section>

      <p className="text-[11px] text-neutral-400 px-1">
        Todo lo que escribas se inyecta en el system prompt de la IA cuando pidas "💡 Sugerir control"
        en la ficha del paciente. Autoguardado.
      </p>
    </div>
  );
}
