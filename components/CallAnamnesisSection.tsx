"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CallClinicalNotesBlock, type CallClinicalData } from "@/components/CallClinicalNotesBlock";

/**
 * Bloque desplegable "Llamada Anamnesis" en la pestaña Formularios del
 * paciente. Texto libre, autoguardado debounced 1s tras la última pulsación.
 * Persiste en Patient.anamnesisCallNotes.
 *
 * Si el lead que originó al paciente tiene un CallSummary generado por IA,
 * mostramos su parte clínica en un bloque arriba como referencia (no lo
 * autopoblamos en el textarea: el fisio decide si copiarlo o escribir el suyo).
 */
export function CallAnamnesisSection({
  patientId,
  initialText,
  clinicalNotes,
}: {
  patientId: string;
  initialText: string | null;
  clinicalNotes?: CallClinicalData | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText ?? "");
  const [savedText, setSavedText] = useState(initialText ?? "");
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasContent = text.trim().length > 0;

  async function persist(value: string) {
    if (value === savedText) return;
    setSaving(true);
    const res = await fetch("/api/patients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: patientId, anamnesisCallNotes: value }),
    }).catch(() => null);
    if (res?.ok) {
      setSavedText(value);
      router.refresh();
    }
    setSaving(false);
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(v), 1000);
  }

  return (
    <section>
      <h2 className="font-medium mb-2">Llamada Anamnesis</h2>
      <details className="card group">
        <summary className="flex justify-between items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <div>
            <div className="font-medium text-sm">📞 Notas de la llamada de anamnesis</div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {hasContent ? "Texto guardado · pulsa para editar" : "Pega aquí las notas tomadas en la videollamada inicial"}
            </div>
          </div>
          <span className="text-neutral-400 text-xs group-open:rotate-180 transition-transform">▼</span>
        </summary>

        <div className="mt-3 border-t border-neutral-100 pt-3">
          <CallClinicalNotesBlock data={clinicalNotes} />
          <textarea
            value={text}
            onChange={onChange}
            rows={12}
            placeholder="Pega o escribe aquí el texto de la llamada de anamnesis…"
            className="w-full resize-y rounded-lg p-3 text-sm font-mono"
            style={{ background: "#FAFAFA", border: "1px solid #E5E5E5", color: "#0A0A0A" }}
          />
          <div className="flex justify-end mt-2">
            <span className="text-xs" style={{ color: saving ? "#737373" : "#16A34A" }}>
              {saving
                ? "Guardando…"
                : text === savedText && hasContent
                ? "✓ Guardado"
                : text === savedText
                ? ""
                : "Cambios sin guardar"}
            </span>
          </div>
        </div>
      </details>
    </section>
  );
}
