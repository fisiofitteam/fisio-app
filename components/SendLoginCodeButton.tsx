"use client";

import { useState } from "react";

/**
 * Botón "Enviar código de acceso ahora" — soporte rápido cuando el
 * paciente dice "no me llega el código por email". Solo CEO/head_success.
 *
 * Llama a /api/patients/[id]/send-login-code, salta el cooldown del
 * flujo público, fuerza envío con Resend y devuelve el error real si
 * algo falla (dominio no verificado, email rebota, RESEND_API_KEY
 * vacía…). Eso le ahorra al CEO buscar logs en Vercel.
 */
export function SendLoginCodeButton({ patientId }: { patientId: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { kind: "ok"; sentTo: string; previewMode?: boolean }
    | { kind: "error"; message: string }
    | null
  >(null);

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/send-login-code`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setResult({ kind: "error", message: data?.error || `HTTP ${res.status}` });
      } else {
        setResult({ kind: "ok", sentTo: data.sentTo, previewMode: data.previewMode });
      }
    } catch (e: any) {
      setResult({ kind: "error", message: e?.message || "Error de red" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="btn btn-ghost text-xs justify-start"
        title="Envía ahora un código de acceso por email al paciente. Útil si dice que no le llega."
      >
        {busy ? "Enviando…" : "📧 Enviar código de acceso"}
      </button>
      {result?.kind === "ok" && (
        <div
          className="text-[11px] rounded px-2 py-1 leading-snug"
          style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#065F46" }}
        >
          ✓ Enviado a <strong>{result.sentTo}</strong>
          {result.previewMode && (
            <span> · ⚠ Resend no configurado, el código solo se ha loggeado en consola</span>
          )}
        </div>
      )}
      {result?.kind === "error" && (
        <div
          className="text-[11px] rounded px-2 py-1 leading-snug"
          style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B" }}
        >
          ⚠ {result.message}
        </div>
      )}
    </div>
  );
}
