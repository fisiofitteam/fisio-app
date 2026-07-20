"use client";

import { useEffect, useState } from "react";
import { Search, Loader2 } from "lucide-react";

type Log = {
  id: string;
  email: string;
  sentTo: string | null;
  sentOk: boolean | null;
  sentError: string | null;
  consumed: boolean;
  attempts: number;
  expiresAt: string;
  createdAt: string;
};

function fmt(dIso: string): string {
  const d = new Date(dIso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) +
    " · " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export function EmailLogsView() {
  const [q, setQ] = useState("");
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load(query: string) {
    setLoading(true);
    setErr(null);
    try {
      const url = query.trim()
        ? `/api/admin/login-code-logs?email=${encodeURIComponent(query.trim())}`
        : "/api/admin/login-code-logs";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error");
      setLogs(data.codes ?? []);
    } catch (e: any) {
      setErr(e?.message || "Error de red");
    }
    setLoading(false);
  }

  useEffect(() => { load(""); }, []);

  return (
    <>
      <div className="flex gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2">
          <Search size={14} className="text-neutral-400" />
          <input
            type="text"
            className="flex-1 outline-none text-sm bg-transparent"
            placeholder="Filtrar por email (parcial)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(q); }}
          />
        </div>
        <button
          onClick={() => load(q)}
          disabled={loading}
          className="btn btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : "Buscar"}
        </button>
      </div>

      {err && (
        <div className="rounded-lg p-3 text-sm bg-red-50 border border-red-200 text-red-800 mb-3">
          ❌ {err}
        </div>
      )}

      {loading && !logs && (
        <p className="text-sm text-neutral-500 text-center py-6">Cargando…</p>
      )}

      {logs && logs.length === 0 && (
        <p className="text-sm text-neutral-500 text-center py-8 card">
          Sin envíos registrados en la búsqueda.
        </p>
      )}

      {logs && logs.length > 0 && (
        <div className="space-y-2">
          {logs.map((l) => {
            const status =
              l.sentOk === null ? "preview" :
              l.sentOk ? (l.consumed ? "usado" : "enviado") : "fallo";
            const badgeColor =
              status === "fallo" ? "bg-red-100 text-red-800" :
              status === "usado" ? "bg-emerald-100 text-emerald-800" :
              status === "enviado" ? "bg-blue-100 text-blue-800" :
              "bg-neutral-100 text-neutral-700";
            const expired = new Date(l.expiresAt).getTime() < Date.now();
            return (
              <div key={l.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{l.email}</span>
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${badgeColor}`}>
                        {status}
                      </span>
                      {expired && !l.consumed && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700">
                          caducado
                        </span>
                      )}
                    </div>
                    {l.sentTo && l.sentTo.toLowerCase() !== l.email.toLowerCase() && (
                      <div className="text-xs text-amber-700 mt-1">
                        ⚠ Se envió a <span className="font-mono">{l.sentTo}</span> (distinto del email escrito).
                      </div>
                    )}
                    {l.sentError && (
                      <div className="text-xs text-red-700 mt-1 font-mono break-all">
                        {l.sentError}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500 text-right flex-shrink-0">
                    <div>{fmt(l.createdAt)}</div>
                    {l.attempts > 0 && (
                      <div className="mt-0.5">{l.attempts} intento{l.attempts !== 1 ? "s" : ""} fallido{l.attempts !== 1 ? "s" : ""}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
