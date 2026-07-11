"use client";

import { useState } from "react";
import { LinkIcon, Check, Loader2 } from "lucide-react";

/**
 * Botón temporal (removido la semana del 2026-07-14 en adelante) para
 * enviar el magic link de acceso del paciente por WhatsApp desde la lista
 * de pacientes del panel del pro.
 *
 * Flujo al click:
 *   1) GET /api/patients/[id]/whatsapp-link → { url, waText, phone }.
 *   2) Copia el texto (saludo + magic link) al portapapeles.
 *   3) Si el paciente tiene grupo de seguimiento (whatsappGroupUrl),
 *      abre esa URL en una pestaña nueva para que el pro pegue el texto
 *      en el chat del grupo (WhatsApp no permite prefijar mensaje al
 *      abrir un grupo, solo cuando el chat es 1-a-1 vía wa.me).
 *   4) Si no hay grupo, cae a `wa.me/<phone>?text=<msg>` (chat directo)
 *      con el texto ya prefijado.
 */
export function SendMagicLinkButton({
  patientId,
  whatsappGroupUrl,
}: {
  patientId: string;
  whatsappGroupUrl: string | null;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch(`/api/patients/${patientId}/whatsapp-link`);
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || "No se pudo generar el magic link");
        setState("idle");
        return;
      }
      const text = data.waText as string;

      // Copiar el mensaje al portapapeles — clave si abrimos el grupo,
      // porque WhatsApp no permite adjuntar texto a un link de grupo.
      try {
        await navigator.clipboard.writeText(text);
      } catch { /* algunos navegadores requieren HTTPS; ignoramos */ }

      const isDemoGroup = !!whatsappGroupUrl && whatsappGroupUrl.includes("DEMO_GROUP_LINK");
      if (whatsappGroupUrl && !isDemoGroup) {
        window.open(whatsappGroupUrl, "_blank", "noopener,noreferrer");
      } else {
        // Fallback: chat 1-a-1 con el texto ya inyectado.
        const phone = String(data.phone || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
        if (!phone) {
          alert("El paciente no tiene grupo de seguimiento ni teléfono guardado.");
          setState("idle");
          return;
        }
        const wa = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
        window.open(wa, "_blank", "noopener,noreferrer");
      }

      setState("done");
      setTimeout(() => setState("idle"), 2000);
    } catch (err: any) {
      alert(err?.message || "Error inesperado");
      setState("idle");
    }
  }

  const label = whatsappGroupUrl
    ? "Enviar magic link (texto copiado; pega en el grupo)"
    : "Enviar magic link por WhatsApp directo";

  return (
    <button
      onClick={handleClick}
      title={label}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors flex-shrink-0 ${
        state === "done"
          ? "bg-emerald-500 text-white"
          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
      }`}
    >
      {state === "loading" ? (
        <Loader2 size={12} className="animate-spin" />
      ) : state === "done" ? (
        <Check size={12} />
      ) : (
        <LinkIcon size={12} />
      )}
      {state === "done" ? "Copiado" : "Magic link"}
    </button>
  );
}
