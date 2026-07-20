"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Entry = { fatigue: number; rpe: number; sleep: number } | null;

const FIELDS: Array<{ key: "fatigue" | "rpe" | "sleep"; label: string; emoji: string; help: string }> = [
  { key: "fatigue", label: "Fatiga", emoji: "🪫", help: "0 = fresco · 10 = reventado" },
  { key: "rpe", label: "RPE", emoji: "🔥", help: "0 = paseo · 10 = al límite" },
  { key: "sleep", label: "Sueño", emoji: "😴", help: "0 = no he dormido · 10 = top" },
];

export function PatientDailyLogForm({
  initial,
  variant = "page",
  recordedDate,
  onSaved,
}: {
  initial: Entry;
  /** "page" usa fondo de tarjeta; "embed" se ajusta a un contenedor ya estilizado (p.ej. dentro de Sesión de hoy). */
  variant?: "page" | "embed";
  /** ISO YYYY-MM-DD. Si viene, el registro se guarda con esa fecha —
   *  se usa en el backfill de días olvidados. Sin él, el server usa
   *  "hoy" en la TZ del paciente. */
  recordedDate?: string;
  /** Callback opcional cuando termina un guardado con éxito. */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [fatigue, setFatigue] = useState<number>(initial?.fatigue ?? 5);
  const [rpe, setRpe] = useState<number>(initial?.rpe ?? 5);
  const [sleep, setSleep] = useState<number>(initial?.sleep ?? 5);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const values: Record<string, number> = { fatigue, rpe, sleep };
  const setters: Record<string, (n: number) => void> = { fatigue: setFatigue, rpe: setRpe, sleep: setSleep };

  async function submit() {
    setSaving(true);
    setSavedOk(false);
    const res = await fetch("/api/patient/daily-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fatigue, rpe, sleep, ...(recordedDate ? { recordedDate } : {}) }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedOk(true);
      router.refresh();
      onSaved?.();
      setTimeout(() => setSavedOk(false), 2500);
    }
  }

  const containerStyle =
    variant === "page"
      ? { background: "var(--p-surface)", border: "1px solid var(--p-border)" }
      : { background: "transparent", border: "none" };

  return (
    <div className="rounded-2xl p-4 space-y-4" style={containerStyle}>
      {FIELDS.map((f) => (
        <Slider
          key={f.key}
          label={f.label}
          emoji={f.emoji}
          help={f.help}
          value={values[f.key]}
          onChange={setters[f.key]}
        />
      ))}

      <div className="flex justify-between items-center pt-1">
        <div className="text-xs" style={{ color: savedOk ? "var(--p-accent)" : "var(--p-text-faint)" }}>
          {savedOk ? "✓ Guardado" : initial ? "Ya registraste hoy · puedes editar" : "Primera vez hoy"}
        </div>
        <button
          onClick={submit}
          disabled={saving}
          className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}
        >
          {saving ? "Guardando…" : initial ? "Actualizar" : "Registrar"}
        </button>
      </div>
    </div>
  );
}

function Slider({
  label, emoji, help, value, onChange,
}: {
  label: string;
  emoji: string;
  help: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span>{emoji}</span>
          <span>{label}</span>
        </div>
        <span className="text-2xl font-bold tabular-nums" style={{ color: "var(--p-accent)", letterSpacing: "-0.02em" }}>
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-yellow-400"
        style={{ accentColor: "var(--p-accent)" }}
      />
      <div className="text-[10px] mt-0.5" style={{ color: "var(--p-text-faint)" }}>{help}</div>
    </div>
  );
}
