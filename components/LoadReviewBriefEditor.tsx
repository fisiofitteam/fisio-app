"use client";

import { useEffect, useRef, useState } from "react";

export function LoadReviewBriefEditor({
  initial,
}: {
  initial: { methodology: string; hardRules: string; goodExamples: string };
}) {
  const [methodology, setMethodology] = useState(initial.methodology);
  const [hardRules, setHardRules] = useState(initial.hardRules);
  const [goodExamples, setGoodExamples] = useState(initial.goodExamples);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSave() {
    setSaving(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await fetch("/api/load-review/brief", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ methodology, hardRules, goodExamples }),
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

      <section className="card space-y-2">
        <label className="text-xs font-medium">Metodología (texto libre)</label>
        <p className="text-[11px] text-neutral-500">
          Cómo progresas cargas, qué frecuencia favoreces, cuándo deload, ejemplos de tu razonamiento. Cuanto más concreto, mejor.
        </p>
        <textarea
          className="input min-h-[160px] font-mono text-xs"
          value={methodology}
          onChange={(e) => { setMethodology(e.target.value); scheduleSave(); }}
          placeholder={`Ej:
- RPE percibido ≤ 7 dos semanas seguidas → subir +5% carga o +1 serie.
- Dolor > 4/10 → mantener carga, revisar técnica.
- Adherencia < 60% → no subir, comprobar barreras.
- Plateau 3 semanas → deload semana 4 (-20%, frecuencia +1).`}
        />
      </section>

      <section className="card space-y-2">
        <label className="text-xs font-medium">Reglas duras de seguridad</label>
        <p className="text-[11px] text-neutral-500">
          Líneas rojas que la IA NUNCA debe saltar. Estos puntos se inyectan con más peso en el prompt.
        </p>
        <textarea
          className="input min-h-[120px] font-mono text-xs"
          value={hardRules}
          onChange={(e) => { setHardRules(e.target.value); scheduleSave(); }}
          placeholder={`Ej:
- Si el paciente reporta dolor agudo nuevo: PARAR la progresión y proponer evaluación clínica.
- Nunca subir > 10% carga semanal.
- No proponer ejercicios olímpicos a paciente con bandera de hombro doloroso < 6 semanas postlesión.`}
        />
      </section>

      <section className="card space-y-2">
        <label className="text-xs font-medium">Buenos ejemplos (opcional)</label>
        <p className="text-[11px] text-neutral-500">
          2-3 propuestas reales que te gustaron. La IA las usa como referencia de estilo y formato.
        </p>
        <textarea
          className="input min-h-[140px] font-mono text-xs"
          value={goodExamples}
          onChange={(e) => { setGoodExamples(e.target.value); scheduleSave(); }}
          placeholder={`Ej:
"Pablo lleva 3 semanas con RPE 6-7 estables. Subir Press a 47.5kg (+2.5kg). Mantener series 4x6. Revisar la próxima semana."`}
        />
      </section>
    </div>
  );
}
