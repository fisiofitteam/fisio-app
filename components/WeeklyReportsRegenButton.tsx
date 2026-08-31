"use client";
/**
 * Botón manual para disparar la generación de resúmenes semanales cuando
 * el cron falla o queremos regenerar una semana concreta. Solo lo
 * renderiza la página /fisio/resumenes si el usuario es manager.
 *
 * Bajo el capó llama a GET /api/cron/generate-weekly-reports?week=YYYY-MM-DD
 * — ese endpoint ya soporta disparo admin con cookie de sesión.
 */
import { useState } from "react";

function mondayIsoUtc(offsetWeeks: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Dom .. 6=Sab
  const backToMonday = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - backToMonday + offsetWeeks * 7);
  return d.toISOString().slice(0, 10);
}

const OPTIONS = [
  { key: "past", label: "Semana pasada", weekOffset: -1 },
  { key: "current", label: "Semana actual", weekOffset: 0 },
];

export function WeeklyReportsRegenButton() {
  const [selected, setSelected] = useState<"past" | "current">("past");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [force, setForce] = useState(false);

  async function run() {
    setBusy(true);
    setFeedback(null);
    try {
      const opt = OPTIONS.find((o) => o.key === selected)!;
      const week = mondayIsoUtc(opt.weekOffset);
      const params = new URLSearchParams({ week });
      if (force) params.set("force", "1");
      const res = await fetch(`/api/cron/generate-weekly-reports?${params}`);
      const text = await res.text();
      let d: any = {};
      try { d = JSON.parse(text); } catch { /* ignore */ }
      if (!res.ok) {
        setFeedback(`❌ Error ${res.status}: ${d?.error || text.slice(0, 200)}`);
        return;
      }
      // El helper devuelve { monday, processed, generated, skipped, errors, ... }
      const msg = [
        `✅ Semana ${week} procesada`,
        typeof d?.processed === "number" ? `${d.processed} pacientes` : null,
        typeof d?.generated === "number" ? `${d.generated} generados` : null,
        typeof d?.skipped === "number" && d.skipped > 0 ? `${d.skipped} saltados (ya existían)` : null,
        typeof d?.errors === "number" && d.errors > 0 ? `${d.errors} errores` : null,
      ].filter(Boolean).join(" · ");
      setFeedback(msg);
    } catch (e: any) {
      setFeedback(`❌ ${e?.message || "Error de red"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card border border-neutral-200 bg-neutral-50/60">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-neutral-600 block mb-1">
            🔁 Regenerar resúmenes manualmente
          </label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value as any)}
            disabled={busy}
            className="input text-sm w-full"
          >
            {OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-neutral-600 pb-2">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} disabled={busy} />
          Forzar (regenerar aunque ya existan)
        </label>
        <button
          onClick={run}
          disabled={busy}
          className="btn btn-primary text-sm whitespace-nowrap"
        >
          {busy ? "Generando…" : "🔁 Generar ahora"}
        </button>
      </div>
      <p className="text-[11px] text-neutral-500 mt-2 italic">
        Úsalo si el cron dominical falló. Tarda 30-90s. Sin "Forzar", saltará los pacientes que ya tengan resumen esa semana.
      </p>
      {feedback && (
        <div className="mt-2 text-xs whitespace-pre-wrap">
          {feedback}
        </div>
      )}
    </section>
  );
}
