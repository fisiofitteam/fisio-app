"use client";
/**
 * Card de configuración del lead magnet Semáforo del Hombro, embebido
 * en el panel /fisio/contenido/lead-magnets/semaforo.
 *
 * Controla:
 *   · Toggle "Convertir en Quiz Funnel" — cambia el comportamiento de la
 *     landing pública. Default OFF (test público directo).
 *   · Textarea del mensaje de WhatsApp que se abre desde el CRM al pulsar
 *     "Contactar" en una respuesta. Placeholders: {{nombre}}, {{color}},
 *     {{movimientos_problema}}.
 *
 * Se guarda con autosave (debounce 800ms + flush al blur).
 */
import { useEffect, useRef, useState } from "react";

type Config = {
  quizFunnelEnabled: boolean;
  funnelWhatsappTemplate: string;
};

export function SemaforoConfigCard() {
  const [config, setConfig] = useState<Config | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/semaforo/admin/config")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setConfig(d.config);
      })
      .catch(() => {});
  }, []);

  async function persist(next: Partial<Config>) {
    setStatus("saving");
    setErrorMsg(null);
    try {
      const r = await fetch("/api/semaforo/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setStatus("error");
        setErrorMsg(d?.hint || d?.error || "Error al guardar");
        return;
      }
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1200);
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message || "Error de red");
    }
  }

  function scheduleTemplate(next: string) {
    if (!config) return;
    setConfig({ ...config, funnelWhatsappTemplate: next });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist({ funnelWhatsappTemplate: next }), 800);
  }

  function toggleFunnel(v: boolean) {
    if (!config) return;
    setConfig({ ...config, quizFunnelEnabled: v });
    persist({ quizFunnelEnabled: v });
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  if (!config) {
    return <div className="text-xs text-neutral-400 italic">Cargando configuración…</div>;
  }

  return (
    <section className="rounded-xl p-4 mb-4" style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold">⚙️ Configuración del test</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">Controla cómo funciona la landing pública y la respuesta que envía la setter.</p>
        </div>
        <span className="text-[10px] text-neutral-400 select-none">
          {status === "saving" && "guardando…"}
          {status === "saved" && <span className="text-emerald-600">✓ guardado</span>}
          {status === "error" && <span className="text-red-600">✕ error</span>}
        </span>
      </div>

      <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg p-3 mb-3"
             style={{ background: config.quizFunnelEnabled ? "rgba(252,211,77,0.14)" : "#FAFAFA", border: `1px solid ${config.quizFunnelEnabled ? "#FCD34D" : "#E5E5E5"}` }}>
        <input
          type="checkbox"
          checked={config.quizFunnelEnabled}
          onChange={(e) => toggleFunnel(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-neutral-900 cursor-pointer"
        />
        <span>
          <span className="text-sm font-semibold text-neutral-800 block">🎯 Convertir en Quiz Funnel</span>
          <span className="text-[11px] text-neutral-600 block leading-snug mt-0.5">
            Cuando está activo, la landing pide nombre + Instagram + <b>teléfono con selector de país</b> al final, NO muestra
            el resultado y muestra una pantalla de gracias diciendo que Ales le contactará por WhatsApp.
            <br />
            Cuando está inactivo, la landing pide nombre + Instagram y muestra el resultado directamente (test público estándar).
          </span>
        </span>
      </label>

      <div>
        <label className="text-xs font-medium text-neutral-700 block mb-1.5">
          💬 Mensaje predefinido de WhatsApp (para el botón "Contactar" del CRM)
        </label>
        <textarea
          value={config.funnelWhatsappTemplate}
          onChange={(e) => scheduleTemplate(e.target.value)}
          onBlur={() => {
            if (debounceRef.current) {
              clearTimeout(debounceRef.current);
              debounceRef.current = null;
            }
            persist({ funnelWhatsappTemplate: config.funnelWhatsappTemplate });
          }}
          rows={5}
          className="w-full text-sm p-2.5 rounded-lg border font-mono"
          style={{ borderColor: "#E5E5E5", background: "#FAFAFA" }}
        />
        <p className="text-[10px] text-neutral-500 mt-1.5 leading-snug">
          Placeholders disponibles:{" "}
          <code className="bg-neutral-100 px-1 rounded">{`{{nombre}}`}</code>{" "}
          <code className="bg-neutral-100 px-1 rounded">{`{{color}}`}</code>{" "}
          <code className="bg-neutral-100 px-1 rounded">{`{{movimientos_problema}}`}</code>
        </p>
      </div>

      {errorMsg && (
        <div className="mt-3 rounded-lg p-2 text-[11px]" style={{ background: "#FEE2E2", color: "#7F1D1D", border: "1px solid #FCA5A5" }}>
          {errorMsg}
        </div>
      )}
    </section>
  );
}
