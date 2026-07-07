"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Botón discreto para forzar la sincronización de métricas de Instagram
 * fuera del cron. Útil si acabas de publicar y quieres ver ya los números.
 */
export function SyncMetricsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "err">("ok");

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cron/sync-content-metrics?manual=1", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setTone("err");
        setMsg(`⚠ ${d?.error ?? d?.reason ?? "error"}`);
      } else if (d.reason === "meta_not_configured") {
        setTone("err");
        setMsg("⚠ Meta no está conectado en Ajustes → Integraciones.");
      } else {
        setTone("ok");
        setMsg(
          `✓ Instagram: ${d.mediaFetched} publicaciones · ${d.refreshed} actualizadas · ${d.matched} nuevas vinculadas${d.ambiguous ? ` · ${d.ambiguous} ambiguas (vincúlalas a mano)` : ""}`
        );
        router.refresh();
      }
    } catch (e: any) {
      setTone("err");
      setMsg(`⚠ ${e?.message ?? "Error de red"}`);
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 8000);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={run}
        disabled={busy}
        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50"
        title="Refresca ahora las métricas desde Instagram (sin esperar al cron diario)"
      >
        {busy ? "Sincronizando…" : "🔄 Sync desde Instagram"}
      </button>
      {msg && (
        <span className={`text-[11px] ${tone === "err" ? "text-red-600" : "text-emerald-700"}`}>
          {msg}
        </span>
      )}
    </div>
  );
}
