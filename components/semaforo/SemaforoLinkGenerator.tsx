"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Modal "Enlace del semáforo". Es el enlace público del formulario
 * — el que se pega en la bio de Instagram, en ads, en Skalex, etc.
 * Opcionalmente puedes añadir una campaña para trackear de dónde
 * viene cada respuesta (`?c=…`).
 */
export function SemaforoLinkGenerator({
  campaignParamName, onClose,
}: {
  igParamName: string;
  campaignParamName: string;
  onClose: () => void;
}) {
  const [campana, setCampana] = useState("");
  const [copied, setCopied] = useState(false);

  const baseUrl = useMemo(() => {
    if (typeof window !== "undefined") return `${window.location.origin}/semaforo`;
    return "/semaforo";
  }, []);

  const url = useMemo(() => {
    const c = campana.trim();
    if (!c) return baseUrl;
    const p = new URLSearchParams();
    p.set(campaignParamName, c);
    return `${baseUrl}?${p.toString()}`;
  }, [baseUrl, campana, campaignParamName]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Copia manual:\n\n" + url);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-semibold">🔗 Enlace del test</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Este es el link público para pegar en Instagram, WhatsApp o donde quieras que la gente empiece el test.</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 text-2xl leading-none">×</button>
        </div>

        <div className="mb-3">
          <div className="text-xs font-semibold mb-1">Enlace público</div>
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              className="flex-1 text-sm p-2.5 rounded-lg border font-mono"
              style={{ borderColor: "#E5E5E5", background: "#FAFAFA" }}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              onClick={copy}
              className="text-sm font-semibold px-4 rounded-lg"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              {copied ? "✓ Copiado" : "Copiar"}
            </button>
          </div>
          <p className="text-[11px] text-neutral-500 mt-2">
            Ábrelo tú mismo para probar cómo se ve. Cada persona que lo abra genera una respuesta en este panel.
          </p>
        </div>

        <details className="mt-5">
          <summary className="text-xs font-medium text-neutral-600 cursor-pointer select-none">
            ⚙️ Añadir campaña de tracking (opcional)
          </summary>
          <div className="mt-3 p-3 rounded-lg" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
            <label className="block">
              <span className="block text-xs text-neutral-500 mb-1">Etiqueta de campaña</span>
              <input
                type="text"
                value={campana}
                onChange={(e) => setCampana(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ""))}
                placeholder="reel-hombro, story-julio, ads-fb…"
                className="w-full text-sm p-2 rounded-lg border"
                style={{ borderColor: "#E5E5E5", background: "#FFFFFF" }}
                maxLength={50}
              />
              <span className="block text-[10px] text-neutral-500 mt-1.5">
                Solo letras, números, punto, guion o guion bajo. Sirve para saber de qué reel/story/anuncio vino cada respuesta en el filtro «Campaña».
              </span>
            </label>
          </div>
        </details>
      </div>
    </div>
  );
}
