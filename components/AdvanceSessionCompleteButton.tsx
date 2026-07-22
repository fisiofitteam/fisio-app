"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

const NOTES_MIN = 20;

export function AdvanceSessionCompleteButton({ initialCompleted, initialNotes }: { initialCompleted: boolean; initialNotes: string | null }) {
  const router = useRouter();
  const [notes, setNotes] = useState<string>(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(initialCompleted);

  async function submit() {
    setSaving(true);
    try {
      const r = await fetch("/api/patient/advance-session/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientNotes: notes.trim() }),
      });
      if (r.ok) {
        setDone(true);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div
        className="rounded-2xl p-4 text-sm flex items-start gap-2"
        style={{ background: "var(--p-green-bg)", border: "1px solid var(--p-green-border)", color: "var(--p-green-text)" }}
      >
        <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold">✓ Sesión de hoy completada</div>
          {notes.trim().length > 0 && (
            <p className="mt-1 text-xs whitespace-pre-wrap opacity-80">{notes.trim()}</p>
          )}
          <button
            onClick={() => setDone(false)}
            className="text-[11px] mt-2 underline opacity-70"
          >
            Editar sensaciones
          </button>
        </div>
      </div>
    );
  }

  const enough = notes.trim().length >= NOTES_MIN;

  return (
    <div
      className="rounded-2xl p-4 space-y-2"
      style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
    >
      <div>
        <label className="text-sm font-semibold block" style={{ color: "var(--p-text)" }}>
          ¿Cómo te has sentido en esta sesión?
        </label>
        <p className="text-xs mt-0.5" style={{ color: "var(--p-text-dim)" }}>
          Detalla las sensaciones que has tenido durante esta sesión — le sirve a tu coach para ajustar tu plan.
        </p>
      </div>
      <textarea
        className="input text-sm"
        rows={4}
        placeholder="Ej: he notado buena tolerancia en la sentadilla, algo de fatiga en el metcon final…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="text-[11px] text-right" style={{ color: enough ? "var(--p-text-dim)" : "var(--p-text-faint)" }}>
        {notes.trim().length}/{NOTES_MIN} mínimo
      </div>
      <button
        onClick={submit}
        disabled={saving || !enough}
        className="w-full font-semibold rounded-lg py-3 text-sm disabled:opacity-60"
        style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}
      >
        {saving ? "Guardando…" : "✓ Marcar sesión como completada"}
      </button>
    </div>
  );
}
