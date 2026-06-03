"use client";

import { useState } from "react";

/**
 * Botón "🔁 Enlace de re-agenda" + modal con la URL que el equipo comercial
 * puede copiar para enviar al lead por WhatsApp/email/IG.
 *
 * El backend genera (o reutiliza) el token de re-agenda asociado al lead.
 * Pensado para usarse dentro de los modales de edición de lead (CallEditModal,
 * SetterLeadModal, FollowUpEditModal). Se renderiza en línea como un botón
 * con texto/estilos heredables.
 */
export function RescheduleLinkButton({
  leadId,
  leadStatus,
  className,
  variant = "subtle",
}: {
  leadId: string;
  /** Si no es "scheduled" no tiene sentido reagendar (won/lost/etc). */
  leadStatus: string;
  className?: string;
  /** "subtle" = texto + emoji, sin fondo; "filled" = botón con fondo claro. */
  variant?: "subtle" | "filled";
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  if (leadStatus !== "scheduled") return null;

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/leads/${leadId}/reschedule-link`, { method: "POST" });
      const data = await res.json();
      if (data.ok && data.url) {
        setUrl(data.url);
      } else {
        setError(data.error || "No se pudo generar el enlace.");
      }
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
  }

  function openModal() {
    setOpen(true);
    if (!url) generate();
  }

  function copyUrl() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const buttonStyle: React.CSSProperties =
    variant === "filled"
      ? { background: "#F5F5F5", color: "#0A0A0A", border: "1px solid #E5E5E5", padding: "6px 10px", borderRadius: 6 }
      : {};

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={
          className ??
          (variant === "filled" ? "text-xs font-medium" : "text-xs text-neutral-600 hover:text-neutral-900 hover:underline")
        }
        style={buttonStyle}
      >
        🔁 Enlace de re-agenda
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium text-sm">🔁 Enlace de re-agenda</h3>
              <button onClick={() => setOpen(false)} className="text-neutral-400 text-xl leading-none">✕</button>
            </div>

            <p className="text-xs text-neutral-500 mb-3">
              Manda este enlace al lead por WhatsApp, email o Instagram. Al abrirlo, podrá
              elegir un nuevo hueco; la cita actual se libera automáticamente.
            </p>

            {loading && <p className="text-sm text-neutral-400 italic">Generando…</p>}

            {error && (
              <div
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B" }}
              >
                {error}
              </div>
            )}

            {url && (
              <>
                <div
                  className="rounded-lg px-3 py-2 text-xs break-all font-mono"
                  style={{ background: "#F5F5F5", border: "1px solid #E5E5E5", color: "#171717" }}
                >
                  {url}
                </div>
                <button
                  onClick={copyUrl}
                  className="w-full mt-3 text-sm font-medium rounded-lg py-2.5"
                  style={{ background: copied ? "#15803D" : "#0A0A0A", color: "#FAFAFA" }}
                >
                  {copied ? "✓ Copiado" : "Copiar enlace"}
                </button>
                <p className="text-[11px] text-neutral-400 mt-3 leading-relaxed">
                  El enlace no caduca y solo sirve para este lead. Si el lead cambia varias
                  veces, el último cambio gana.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
