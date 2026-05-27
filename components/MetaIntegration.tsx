"use client";

import { useEffect, useState } from "react";

type Data = {
  configured: boolean;
  account?: { username: string; followersCount: number; mediaCount: number } | null;
  newFollowers?: number | null;
  adSpendMonth?: number | null;
  posts?: { id: string; caption: string; timestamp: string; permalink: string; mediaType: string; likes: number; comments: number; reach: number; saved: number; shares: number }[];
  errors?: string[];
};

const eur = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;

export function MetaIntegration() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/meta", { cache: "no-store" });
      setData(await res.json());
    } catch { setData({ configured: false }); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function syncFollowers() {
    setSyncing(true); setMsg(null);
    const res = await fetch("/api/integrations/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync-followers" }),
    });
    const d = await res.json();
    setMsg(res.ok ? `Guardado: ${d.totalFollowers} seguidores · +${d.newFollowers} este mes` : `Error: ${d.error}`);
    setSyncing(false);
  }

  if (loading) return <p className="text-sm text-neutral-400">Cargando…</p>;

  if (!data?.configured) {
    return (
      <div className="card">
        <p className="text-sm text-neutral-600">
          Meta aún no está conectado. Configura las variables de entorno
          (<code className="text-xs">META_ACCESS_TOKEN</code>, <code className="text-xs">META_IG_USER_ID</code>,
          {" "}<code className="text-xs">META_AD_ACCOUNT_ID</code>) en Vercel y vuelve a esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.errors && data.errors.length > 0 && (
        <div className="card bg-amber-50 border-amber-200 text-sm text-amber-900">
          <div className="font-medium mb-1">Avisos de la API:</div>
          <ul className="list-disc ml-4 text-xs">{data.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Cuenta" value={data.account?.username ? `@${data.account.username}` : "—"} />
        <Stat label="Seguidores" value={data.account ? data.account.followersCount.toLocaleString("es-ES") : "—"} />
        <Stat label="Nuevos (30d)" value={data.newFollowers != null ? `+${data.newFollowers}` : "—"} />
        <Stat label="Gasto ADS (mes)" value={data.adSpendMonth != null ? eur(data.adSpendMonth) : "—"} />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={syncFollowers} disabled={syncing} className="btn btn-primary text-sm">
          {syncing ? "Sincronizando…" : "Sincronizar seguidores al mes actual"}
        </button>
        {msg && <span className="text-sm text-neutral-600">{msg}</span>}
      </div>

      {data.posts && data.posts.length > 0 && (
        <section className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                <th className="text-left py-2 px-3 font-medium">Publicación</th>
                <th className="text-right py-2 px-2 font-medium">Alcance</th>
                <th className="text-right py-2 px-2 font-medium">Likes</th>
                <th className="text-right py-2 px-2 font-medium">Coment.</th>
                <th className="text-right py-2 px-2 font-medium">Guard.</th>
                <th className="text-right py-2 px-3 font-medium">Compart.</th>
              </tr>
            </thead>
            <tbody>
              {data.posts.map((p) => (
                <tr key={p.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2 px-3 text-xs">
                    <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {new Date(p.timestamp).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                    </a>
                    <span className="text-neutral-500"> · {p.caption || p.mediaType}</span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.reach.toLocaleString("es-ES")}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.likes}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.comments}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.saved}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{p.shares}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className="text-xl font-semibold truncate">{value}</div>
    </div>
  );
}
