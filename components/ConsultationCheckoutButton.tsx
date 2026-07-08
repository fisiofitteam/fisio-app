"use client";

import { useState } from "react";

/**
 * Botón "Reservar mi consulta" del flujo Prevention → consulta puntual 17 €.
 * Al pulsar hace POST a /api/prevention/consultation/checkout y redirige a
 * la URL de Stripe Checkout que devuelve.
 */
export function ConsultationCheckoutButton() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState(false);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/prevention/consultation/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const d = await res.json();
      if (!res.ok || !d.url) throw new Error(d?.error || "No pudimos iniciar el pago");
      window.location.href = d.url;
    } catch (e: any) {
      setErr(e?.message ?? "Error de red");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {expanded && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Cuéntanos brevemente qué te preocupa (opcional)."
          className="w-full text-sm px-3 py-2 rounded-xl outline-none"
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.3)",
            color: "#FFFFFF",
          }}
        />
      )}
      <button
        onClick={() => (expanded ? go() : setExpanded(true))}
        disabled={busy}
        className="w-full text-sm font-semibold py-3 rounded-xl disabled:opacity-50"
        style={{ background: "#FFFFFF", color: "#F59E0B" }}
      >
        {busy ? "Redirigiendo…" : expanded ? "Ir a pago seguro (Stripe) →" : "Reservar mi consulta →"}
      </button>
      {err && (
        <div className="text-xs bg-red-50 text-red-700 rounded-md px-2 py-1.5">⚠ {err}</div>
      )}
    </div>
  );
}
