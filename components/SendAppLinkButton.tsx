"use client";

import { useState } from "react";

/**
 * Botón inline "📲 Enviar link de la app" para usar en listas (p. ej.
 * leads vendidos en /fisio/llamadas-venta). En un click pide al backend
 * el magic link del paciente (reutiliza si vigente, o crea uno a 365 días)
 * y copia el mensaje completo al portapapeles para pegar en WhatsApp.
 *
 * No abre dropdown ni modal — pensado para ir junto a "Ver ficha".
 */
export function SendAppLinkButton({
  patientId,
  patientName,
}: {
  patientId: string;
  patientName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copyMessage(e: React.MouseEvent) {
    // Esto suele vivir dentro de una <Card clickable>: evitamos que el
    // click se propague al wrapper y abra cosas que no toca.
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setStatus("idle");
    try {
      const res = await fetch(`/api/patients/${patientId}/access-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: false }),
      });
      if (!res.ok) throw new Error("backend");
      const data = await res.json();
      const fullUrl = `${window.location.origin}${data.url}`;
      const firstName = patientName.split(" ")[0];
      const msg = `Hola ${firstName} 👋\n\nYa tienes acceso a la app de FisioFit Team. Toca este link para entrar directamente:\n\n${fullUrl}\n\nDentro encontrarás tu programa, vídeos y todo lo que necesitas. Cualquier duda, escríbenos por aquí.`;
      await navigator.clipboard.writeText(msg);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copyMessage}
      disabled={busy}
      className="text-[11px] text-blue-700 mt-1 inline-block hover:underline disabled:opacity-50"
      title="Copiar mensaje con el link de acceso a la app para WhatsApp"
    >
      {busy
        ? "Generando…"
        : status === "copied"
          ? "✓ Mensaje copiado · pega en WhatsApp"
          : status === "error"
            ? "⚠ No se pudo copiar"
            : "📲 Copiar mensaje con link de la app"}
    </button>
  );
}
