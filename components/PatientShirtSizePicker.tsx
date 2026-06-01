"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

/**
 * Card inline que se muestra a un paciente ADVANCE cuando aún no ha elegido
 * talla de camiseta. Al tocar una talla se guarda y la card desaparece.
 * Se renderiza dentro de PatientHomeRolling.
 */
export function PatientShirtSizePicker() {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function pick(size: string) {
    setSaving(size);
    const res = await fetch("/api/patient/shirt-size", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size }),
    });
    if (res.ok) {
      setDone(size);
      // Refresh para que el server re-renderice y oculte la card
      setTimeout(() => router.refresh(), 600);
    } else {
      setSaving(null);
    }
  }

  return (
    <section
      className="rounded-2xl p-4 mb-5"
      style={{
        background: "linear-gradient(135deg, var(--p-accent) 0%, #F59E0B 100%)",
        color: "var(--p-accent-ink)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">👕</span>
        <span className="text-[10px] font-bold tracking-wider uppercase">
          Tu camiseta ADVANCE
        </span>
      </div>
      <p className="text-sm font-medium mb-3" style={{ letterSpacing: "-0.015em" }}>
        Selecciona tu talla para que la preparemos:
      </p>
      <div className="grid grid-cols-6 gap-1.5">
        {SIZES.map((s) => {
          const isSaving = saving === s;
          const isDone = done === s;
          return (
            <button
              key={s}
              onClick={() => !saving && pick(s)}
              disabled={!!saving}
              className="py-2 rounded-lg text-sm font-bold transition-transform active:scale-95 disabled:opacity-60"
              style={{
                background: isDone ? "rgba(10,10,10,0.85)" : "rgba(10,10,10,0.15)",
                color: isDone ? "var(--p-accent)" : "var(--p-accent-ink)",
                border: "1px solid rgba(10,10,10,0.2)",
              }}
            >
              {isSaving ? "…" : isDone ? "✓" : s}
            </button>
          );
        })}
      </div>
    </section>
  );
}
