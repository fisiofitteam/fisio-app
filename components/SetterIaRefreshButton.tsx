"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Botón "Sincronizar ahora" para /fisio/setter-ia. Llama al cron manual
 * (`/api/cron/skalex-sync?manual=1`, protegido con sesión CEO) y refresca
 * la página para reflejar los datos nuevos.
 */
export function SetterIaRefreshButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  async function trigger() {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/cron/skalex-sync?manual=1", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error || `Error ${res.status}`);
      } else {
        setStatus(
          `${data.processed ?? 0} procesadas · ${data.created ?? 0} nuevas · ${data.updated ?? 0} actualizadas`,
        );
        router.refresh();
      }
    } catch (e: any) {
      setStatus(e?.message || "Error de red");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="text-right">
      <button
        onClick={trigger}
        disabled={loading}
        className="text-sm font-medium px-3 py-1.5 rounded-md border disabled:opacity-50"
        style={{ background: "#0A0A0A", color: "#FAFAFA", borderColor: "#0A0A0A" }}
      >
        {loading ? "Sincronizando…" : "Sincronizar ahora"}
      </button>
      {status && <p className="text-[11px] text-neutral-500 mt-1">{status}</p>}
    </div>
  );
}
