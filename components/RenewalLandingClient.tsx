"use client";

import { useEffect, useState } from "react";
import { applyVars, type RenewalLandingCopy } from "@/lib/landing-content";

type Data = {
  status: string;
  expired: boolean;
  patientName: string;
  programType: string;
  durationMonths: number;
  amountCents: number;
  currency: string;
};

function formatAmount(cents: number, currency: string) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: (currency || "eur").toUpperCase() });
}

export function RenewalLandingClient({ token, copy }: { token: string; copy: RenewalLandingCopy }) {
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [paying, setPaying] = useState(false);
  const cancelled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("cancelled") === "1";

  useEffect(() => {
    fetch(`/api/renewal/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || "Link no válido");
        }
        return r.json();
      })
      .then((d: Data) => {
        setData(d);
        setState("ready");
      })
      .catch((e) => {
        setErrorMsg(e.message || "Link no válido");
        setState("error");
      });
  }, [token]);

  async function pay() {
    setPaying(true);
    try {
      const res = await fetch(`/api/renewal/${token}/checkout`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) {
        window.location.href = d.url;
      } else {
        setErrorMsg(d.error || "No se pudo iniciar el pago.");
        setPaying(false);
      }
    } catch {
      setErrorMsg("Error de red al iniciar el pago.");
      setPaying(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-10 bg-neutral-50">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-3xl font-bold" style={{ letterSpacing: "-0.03em" }}>
            Fisio<span className="brand-gradient-text">Fit</span>
          </div>
        </div>

        {state === "loading" && (
          <div className="card text-center py-10 text-sm text-neutral-500">Cargando...</div>
        )}

        {state === "error" && (
          <div className="card text-center py-10">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-sm text-neutral-700">{errorMsg}</p>
          </div>
        )}

        {state === "ready" && data && (
          <div className="card">
            {data.status === "paid" ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">✅</div>
                <h1 className="font-semibold text-lg mb-1">Renovación completada</h1>
                <p className="text-sm text-neutral-500">Esta renovación ya está pagada. ¡Gracias!</p>
              </div>
            ) : data.expired ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">⌛</div>
                <h1 className="font-semibold text-lg mb-1">Enlace caducado</h1>
                <p className="text-sm text-neutral-500">Pide a tu coach que te genere uno nuevo.</p>
              </div>
            ) : (
              (() => {
                const amount = formatAmount(data.amountCents, data.currency);
                const vars = {
                  nombre: data.patientName.split(" ")[0],
                  programa: data.programType,
                  meses: String(data.durationMonths),
                  importe: amount,
                };
                const v = (t: string) => applyVars(t, vars);
                return (
                  <>
                    <h1 className="font-bold text-xl leading-tight mb-1.5">{v(copy.headline)}</h1>
                    <p className="text-sm text-neutral-600 mb-4">{v(copy.subheadline)}</p>

                    {copy.bullets.length > 0 && (
                      <ul className="space-y-2 mb-4">
                        {copy.bullets.map((b, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-neutral-700">
                            <span className="text-emerald-500 mt-0.5">✓</span>
                            <span>{v(b)}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="bg-neutral-50 rounded-lg p-4 mb-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Programa</span>
                        <span className="font-medium">{data.programType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Duración</span>
                        <span className="font-medium">{data.durationMonths} {data.durationMonths === 1 ? "mes" : "meses"}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-neutral-200">
                        <span className="text-neutral-500">Total</span>
                        <span className="font-bold text-base">{amount}</span>
                      </div>
                    </div>

                    {cancelled && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-3">
                        Has cancelado el pago. Puedes intentarlo de nuevo cuando quieras.
                      </p>
                    )}
                    {errorMsg && <p className="text-sm text-red-600 mb-3">{errorMsg}</p>}

                    <button onClick={pay} disabled={paying} className="btn btn-primary w-full">
                      {paying ? "Redirigiendo a pago seguro..." : `${v(copy.ctaLabel)} · ${amount}`}
                    </button>
                    <p className="text-[11px] text-neutral-400 text-center mt-3">{v(copy.reassurance)}</p>
                  </>
                );
              })()
            )}
          </div>
        )}
      </div>
    </main>
  );
}
