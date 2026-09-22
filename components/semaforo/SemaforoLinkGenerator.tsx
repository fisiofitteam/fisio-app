"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Modal "Generar enlace". Dos salidas para copiar:
 *   - Enlace de prueba con ?ig=prueba (para verificar el flow).
 *   - Plantilla para Skalex con ?ig=<VARIABLE_SKALEX> — el usuario
 *     sustituye el placeholder por la variable exacta de Skalex al
 *     conectar la automatización.
 */
export function SemaforoLinkGenerator({
  igParamName, campaignParamName, onClose,
}: {
  igParamName: string;
  campaignParamName: string;
  onClose: () => void;
}) {
  const [campana, setCampana] = useState("reel-hombro");
  const [copied, setCopied] = useState<string | null>(null);

  const baseUrl = useMemo(() => {
    if (typeof window !== "undefined") return `${window.location.origin}/semaforo`;
    return "/semaforo";
  }, []);

  const testUrl = useMemo(() => {
    const p = new URLSearchParams();
    p.set(igParamName, "prueba");
    if (campana.trim()) p.set(campaignParamName, campana.trim());
    return `${baseUrl}?${p.toString()}`;
  }, [baseUrl, campana, igParamName, campaignParamName]);

  const skalexTemplate = useMemo(() => {
    const p = new URLSearchParams();
    p.set(igParamName, "__VARIABLE_SKALEX__");
    if (campana.trim()) p.set(campaignParamName, campana.trim());
    return `${baseUrl}?${p.toString()}`.replace("__VARIABLE_SKALEX__", "<VARIABLE_SKALEX>");
  }, [baseUrl, campana, igParamName, campaignParamName]);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      alert("Copia manual:\n\n" + value);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-semibold">🔗 Generar enlace</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Para el flujo de Skalex y para pruebas manuales.</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 text-2xl leading-none">×</button>
        </div>

        <label className="block mb-4">
          <span className="block text-xs text-neutral-500 mb-1">Campaña (opcional)</span>
          <input
            type="text"
            value={campana}
            onChange={(e) => setCampana(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ""))}
            placeholder="reel-hombro, ad-story-mayo…"
            className="w-full text-sm p-2 rounded-lg border"
            style={{ borderColor: "#E5E5E5" }}
            maxLength={50}
          />
          <span className="block text-[10px] text-neutral-500 mt-1">Solo letras, números, punto, guion o guion bajo.</span>
        </label>

        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold mb-1">🧪 Enlace de prueba</div>
            <div className="flex gap-2">
              <input
                readOnly
                value={testUrl}
                className="flex-1 text-xs p-2 rounded border font-mono"
                style={{ borderColor: "#E5E5E5", background: "#FAFAFA" }}
              />
              <button
                onClick={() => copy(testUrl, "test")}
                className="text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ background: "#0A0A0A", color: "#FAFAFA" }}
              >
                {copied === "test" ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">Ábrelo tú para comprobar que el registro aparece con instagram=<code>prueba</code>.</p>
          </div>

          <div>
            <div className="text-xs font-semibold mb-1">🤖 Plantilla para Skalex</div>
            <div className="flex gap-2">
              <input
                readOnly
                value={skalexTemplate}
                className="flex-1 text-xs p-2 rounded border font-mono"
                style={{ borderColor: "#E5E5E5", background: "#FAFAFA" }}
              />
              <button
                onClick={() => copy(skalexTemplate, "skalex")}
                className="text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ background: "#0A0A0A", color: "#FAFAFA" }}
              >
                {copied === "skalex" ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">
              Sustituye <code>&lt;VARIABLE_SKALEX&gt;</code> por la variable exacta de Skalex que trae el usuario de Instagram cuando conectes la automatización.
              Si Skalex no puede pasar el usuario, todo funciona igual — el paso final pedirá nombre + @/teléfono.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
