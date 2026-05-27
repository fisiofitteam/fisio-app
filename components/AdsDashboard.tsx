"use client";

import { useEffect, useState } from "react";

type Campaign = { campaignId: string; name: string; spend: number; bucket: string };
const eur = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;

export function AdsDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/meta/ads", { cache: "no-store" });
      const d = await res.json();
      if (d.error) setErr(d.error);
      setCampaigns(d.campaigns ?? []);
    } catch { setCampaigns([]); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function setBucket(campaignId: string, bucket: string) {
    setCampaigns((arr) => arr?.map((c) => (c.campaignId === campaignId ? { ...c, bucket } : c)) ?? null);
    await fetch("/api/integrations/meta/ads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, bucket }),
    }).catch(() => {});
  }

  async function syncMonth() {
    setSyncing(true); setMsg(null);
    const res = await fetch("/api/integrations/meta/ads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync-month" }),
    });
    const d = await res.json();
    setMsg(res.ok ? `Volcado al mes: Follow me ${eur(d.follow)} · Conversión ${eur(d.conversion)}` : `Error: ${d.error}`);
    setSyncing(false);
  }

  if (loading) return <p className="text-sm text-neutral-400">Cargando campañas…</p>;

  const followTotal = campaigns?.filter((c) => c.bucket === "follow").reduce((a, c) => a + c.spend, 0) ?? 0;
  const convTotal = campaigns?.filter((c) => c.bucket === "conversion").reduce((a, c) => a + c.spend, 0) ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-sm">Anuncios del mes (por campaña)</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">Follow me <b className="text-neutral-800">{eur(followTotal)}</b> · Conversión <b className="text-neutral-800">{eur(convTotal)}</b></span>
          <button onClick={syncMonth} disabled={syncing} className="btn btn-primary text-xs">
            {syncing ? "Volcando…" : "Sincronizar inversión al mes"}
          </button>
        </div>
      </div>
      {msg && <p className="text-xs text-neutral-600">{msg}</p>}
      {err && <p className="text-xs text-amber-700">⚠ {err}</p>}

      {!campaigns || campaigns.length === 0 ? (
        <p className="text-sm text-neutral-400 italic py-3">No hay campañas con gasto este mes.</p>
      ) : (
        <section className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                <th className="text-left py-2 px-3 font-medium">Campaña</th>
                <th className="text-right py-2 px-2 font-medium">Gasto (mes)</th>
                <th className="text-left py-2 px-3 font-medium">Clasificación</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.campaignId} className="border-b border-neutral-100">
                  <td className="py-2 px-3">{c.name}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-medium">{eur(c.spend)}</td>
                  <td className="py-2 px-3">
                    <select className="input text-xs w-auto" value={c.bucket} onChange={(e) => setBucket(c.campaignId, e.target.value)}>
                      <option value="">— Sin clasificar —</option>
                      <option value="follow">Follow me</option>
                      <option value="conversion">Conversión</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="text-[11px] text-neutral-400">
        Clasifica cada campaña y pulsa "Sincronizar inversión al mes" para volcar los totales a
        Follow me ADs y Conversión ADs del Cuadro de mandos (mes actual).
      </p>
    </div>
  );
}
