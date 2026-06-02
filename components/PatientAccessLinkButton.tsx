"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";

/**
 * Botón "Link de acceso" en la cabecera del paciente.
 * Al pulsar: pide el magic link al backend (reutiliza si vigente o crea uno
 * nuevo a 365 días), lo construye con la URL absoluta del navegador y lo copia
 * al portapapeles para pegar en WhatsApp.
 */
export function PatientAccessLinkButton({ patientId, patientName }: { patientId: string; patientName: string }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMessage, setShowMessage] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);

  async function getLink(regenerate = false): Promise<string | null> {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/patients/${patientId}/access-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerate }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      setError("No se pudo generar el link");
      return null;
    }
    const data = await res.json();
    const fullUrl = `${window.location.origin}${data.url}`;
    setLastUrl(fullUrl);
    return fullUrl;
  }

  async function copyOnly() {
    const url = await getLink();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("No se pudo copiar al portapapeles");
    }
  }

  function copyMessage() {
    if (!lastUrl) return;
    const firstName = patientName.split(" ")[0];
    const msg = `Hola ${firstName} 👋\n\nYa tienes acceso a la app de FisioFit Team. Toca este link para entrar directamente:\n\n${lastUrl}\n\nDentro encontrarás tu programa, vídeos y todo lo que necesitas. Cualquier duda, escríbenos por aquí.`;
    navigator.clipboard.writeText(msg).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2200); },
      () => setError("No se pudo copiar"),
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { copyOnly().then(() => setShowMessage(true)); }}
        disabled={busy}
        className="btn btn-ghost text-xs flex items-center gap-1.5"
        title="Copia un magic link para enviar por WhatsApp"
      >
        <Link2 size={13} />
        {busy ? "Generando…" : copied ? "✓ Copiado" : "Link de acceso"}
      </button>

      {error && (
        <div className="absolute right-0 top-full mt-1 text-xs px-2 py-1 rounded bg-red-50 border border-red-200 text-red-700 whitespace-nowrap">
          {error}
        </div>
      )}

      {showMessage && lastUrl && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowMessage(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-40 rounded-lg shadow-lg p-3 text-xs"
            style={{ background: "#FFFFFF", border: "1px solid #E5E5E5", minWidth: 280 }}
          >
            <div className="font-medium text-sm mb-1.5 flex items-center gap-1.5">
              ✓ Link copiado al portapapeles
            </div>
            <div
              className="rounded p-2 mb-2 text-[11px] font-mono break-all"
              style={{ background: "#FAFAFA", color: "#525252", border: "1px solid #F0F0F0" }}
            >
              {lastUrl}
            </div>
            <div className="text-[11px] text-neutral-500 mb-2">
              Pégalo en WhatsApp. Caduca a los 365 días; vuelve a copiar cuando lo necesites.
            </div>
            <div className="flex justify-between gap-2">
              <button
                onClick={copyMessage}
                className="text-xs font-medium px-2 py-1.5 rounded-lg"
                style={{ background: "#0A0A0A", color: "#FAFAFA" }}
              >
                📋 Copiar mensaje completo
              </button>
              <button
                onClick={async () => {
                  if (!confirm("¿Generar un link nuevo? El anterior dejará de funcionar.")) return;
                  const url = await getLink(true);
                  if (url) {
                    try {
                      await navigator.clipboard.writeText(url);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2200);
                    } catch {}
                  }
                }}
                className="text-xs text-neutral-500 hover:text-neutral-900"
              >
                🔄 Regenerar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
