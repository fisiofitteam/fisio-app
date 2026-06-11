"use client";

import { useState } from "react";
import { interpolate, buildWhatsAppUrl } from "@/lib/message-render";
import { extractYouTubeId } from "@/components/SuccessCasesList";

export type SuccessCaseOption = {
  id: string;
  name: string;
  injury: string;
  youtubeUrl: string;
};

export type SendCaseTemplate = {
  id: string;
  name: string;
  body: string;
};

export type SendCaseTarget = {
  leadName: string;
  leadPhone: string | null;
  closerFullName: string;
  closerIntro: string | null;
};

/**
 * Modal que pide elegir un SuccessCase y, al clicar, interpola la plantilla
 * con los datos del lead + closer + caso y abre WhatsApp en pestaña nueva.
 *
 * Si el lead no tiene teléfono, copia el texto al portapapeles como fallback
 * y avisa al closer.
 */
export function SendCaseFlow({
  open,
  onClose,
  template,
  target,
  cases,
}: {
  open: boolean;
  onClose: () => void;
  template: SendCaseTemplate;
  target: SendCaseTarget;
  cases: SuccessCaseOption[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [copiedFallback, setCopiedFallback] = useState(false);

  if (!open) return null;

  function pick(c: SuccessCaseOption) {
    const text = interpolate(template.body, {
      nombre: target.leadName,
      closer: target.closerFullName,
      fisio: target.closerFullName,
      "closer.intro": target.closerIntro ?? "",
      "fisio.intro": target.closerIntro ?? "",
      "caso.nombre": c.name,
      "caso.lesion": c.injury,
      "caso.link": c.youtubeUrl,
    });
    const url = buildWhatsAppUrl(target.leadPhone, text);
    if (!url) {
      // Sin teléfono → fallback: portapapeles.
      navigator.clipboard.writeText(text).then(() => {
        setCopiedFallback(true);
        setError("Este lead no tiene teléfono. Copié el mensaje al portapapeles para que lo pegues a mano.");
      }).catch(() => {
        setError("Este lead no tiene teléfono y no pude copiar al portapapeles. El mensaje generado se ve abajo:");
        // Pequeño hack: muestro el texto debajo para que pueda copiarlo a mano.
        setCopiedFallback(false);
      });
      return;
    }
    window.open(url, "_blank", "noopener");
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <div>
            <h3 className="font-medium text-sm">📤 {template.name}</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Elige el caso que quieres enviar a {target.leadName}.</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>

        {cases.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-neutral-500">No hay casos de éxito activos.</p>
            <p className="text-xs text-neutral-400 mt-1">Pídele al CEO que los añada en Biblioteca → Casos de éxito.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {cases.map((c) => {
              const yt = extractYouTubeId(c.youtubeUrl);
              return (
                <button
                  key={c.id}
                  onClick={() => pick(c)}
                  className="flex gap-2 p-2 rounded-lg border border-neutral-200 hover:border-neutral-900 hover:shadow-sm transition-all text-left"
                >
                  {yt ? (
                    <img
                      src={`https://img.youtube.com/vi/${yt}/mqdefault.jpg`}
                      alt={c.name}
                      className="w-20 h-14 object-cover rounded flex-shrink-0 bg-neutral-100"
                    />
                  ) : (
                    <div className="w-20 h-14 rounded bg-neutral-100 flex items-center justify-center text-xl flex-shrink-0">
                      🎬
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-neutral-500 line-clamp-2">{c.injury}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">
            {error}
            {copiedFallback && <div className="mt-1 font-medium">✓ Copiado al portapapeles</div>}
          </div>
        )}
      </div>
    </div>
  );
}
