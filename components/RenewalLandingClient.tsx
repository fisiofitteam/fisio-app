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

function formatEuros(cents: number): string {
  const euros = cents / 100;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: euros % 1 === 0 ? 0 : 2,
  }).format(euros);
}

const PROGRAM_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  RECUPERA: { bg: "rgba(168, 85, 247, 0.15)", color: "#C084FC", border: "#7C3AED" },
  CONSOLIDA: { bg: "rgba(59, 130, 246, 0.15)", color: "#60A5FA", border: "#2563EB" },
  ADVANCE: { bg: "rgba(56, 189, 248, 0.15)", color: "#38BDF8", border: "#0284C7" },
};

// Tarjeta oscura reutilizada en todos los estados
function Panel({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "error" }) {
  return (
    <div
      className="rounded-2xl p-6 sm:p-8"
      style={{
        background: tone === "error" ? "rgba(127, 29, 29, 0.25)" : "rgba(20, 20, 20, 0.85)",
        border: `1px solid ${tone === "error" ? "#7F1D1D" : "#262626"}`,
        backdropFilter: "blur(8px)",
      }}
    >
      {children}
    </div>
  );
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

  const badge = data ? PROGRAM_BADGE[data.programType] || PROGRAM_BADGE.CONSOLIDA : PROGRAM_BADGE.CONSOLIDA;

  return (
    <div
      className="min-h-screen w-full"
      style={{
        backgroundColor: "#0A0A0A",
        backgroundImage: "url('/box.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="min-h-screen w-full" style={{ background: "rgba(10, 10, 10, 0.78)" }}>
        <div className="max-w-2xl mx-auto px-4 py-12 sm:py-16">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-10">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "#FFD400" }}>
              <span className="text-lg">⚡</span>
            </div>
            <span className="text-lg font-semibold tracking-tight" style={{ color: "#FAFAFA" }}>
              FisioFit Team
            </span>
          </div>

          {state === "loading" && (
            <Panel>
              <p className="text-sm text-center" style={{ color: "#A3A3A3" }}>Cargando...</p>
            </Panel>
          )}

          {state === "error" && (
            <Panel tone="error">
              <p className="text-sm text-center" style={{ color: "#FCA5A5" }}>{errorMsg}</p>
              <p className="text-xs mt-3 text-center" style={{ color: "#A3A3A3" }}>
                Si crees que es un error, escríbenos al WhatsApp.
              </p>
            </Panel>
          )}

          {state === "ready" && data && (
            <>
              {data.status === "paid" ? (
                <Panel>
                  <div className="text-center">
                    <div className="text-4xl mb-3">✅</div>
                    <h1 className="text-2xl font-bold mb-1" style={{ color: "#FAFAFA" }}>Renovación completada</h1>
                    <p className="text-sm" style={{ color: "#A3A3A3" }}>Esta renovación ya está pagada. ¡Gracias!</p>
                  </div>
                </Panel>
              ) : data.expired ? (
                <Panel>
                  <div className="text-center">
                    <div className="text-4xl mb-3">⌛</div>
                    <h1 className="text-2xl font-bold mb-1" style={{ color: "#FAFAFA" }}>Enlace caducado</h1>
                    <p className="text-sm" style={{ color: "#A3A3A3" }}>Pide a tu coach que te genere uno nuevo.</p>
                  </div>
                </Panel>
              ) : (
                (() => {
                  const amount = formatEuros(data.amountCents);
                  const vars = {
                    nombre: data.patientName.split(" ")[0],
                    programa: data.programType,
                    meses: String(data.durationMonths),
                    importe: amount,
                  };
                  const v = (t: string) => applyVars(t, vars);
                  return (
                    <>
                      {/* Cabecera */}
                      <div className="text-center mb-8">
                        <p className="text-sm uppercase tracking-widest mb-2" style={{ color: "#737373" }}>
                          Tu renovación
                        </p>
                        <h1 className="text-3xl sm:text-4xl font-bold mb-2 tracking-tight" style={{ color: "#FAFAFA" }}>
                          {v(copy.headline)}
                        </h1>
                        <p className="text-sm" style={{ color: "#A3A3A3" }}>{v(copy.subheadline)}</p>
                      </div>

                      <Panel>
                        {/* Badges */}
                        <div className="flex items-center justify-between mb-5">
                          <span
                            className="inline-block px-3 py-1 rounded-full text-[10px] font-semibold tracking-wider"
                            style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                          >
                            {data.programType.toUpperCase()}
                          </span>
                          <span
                            className="inline-block px-2.5 py-1 rounded-md text-[10px] font-semibold"
                            style={{ background: "rgba(255, 212, 0, 0.1)", color: "#FFD400", border: "1px solid rgba(255, 212, 0, 0.3)" }}
                          >
                            {data.durationMonths} {data.durationMonths === 1 ? "MES" : "MESES"}
                          </span>
                        </div>

                        {/* Mensajes */}
                        {copy.bullets.length > 0 && (
                          <ul className="space-y-2.5 mb-6">
                            {copy.bullets.map((b, i) => (
                              <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: "#D4D4D4" }}>
                                <span style={{ color: "#FFD400" }}>✓</span>
                                <span>{v(b)}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="my-6 h-px" style={{ background: "linear-gradient(to right, transparent, #404040, transparent)" }} />

                        {/* Precio + duración */}
                        <div className="flex items-baseline justify-between mb-6">
                          <div>
                            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "#737373" }}>Total</p>
                            <p className="text-3xl font-bold tabular-nums" style={{ color: "#FAFAFA" }}>{amount}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "#737373" }}>Duración</p>
                            <p className="text-lg font-semibold tabular-nums" style={{ color: "#FAFAFA" }}>
                              {data.durationMonths} {data.durationMonths === 1 ? "mes" : "meses"}
                            </p>
                          </div>
                        </div>

                        {cancelled && (
                          <p className="text-xs mb-4 rounded-lg px-3 py-2" style={{ background: "rgba(245, 158, 11, 0.12)", color: "#FCD34D", border: "1px solid rgba(245,158,11,0.3)" }}>
                            Has cancelado el pago. Puedes intentarlo de nuevo cuando quieras.
                          </p>
                        )}
                        {errorMsg && (
                          <p className="text-sm mb-4" style={{ color: "#FCA5A5" }}>{errorMsg}</p>
                        )}

                        {/* Botón pago */}
                        <button
                          onClick={pay}
                          disabled={paying}
                          className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-tight transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ background: "#FFD400", color: "#0A0A0A" }}
                        >
                          {paying ? "Redirigiendo a pago seguro..." : `${v(copy.ctaLabel)} · ${amount} →`}
                        </button>

                        <p className="mt-4 text-[11px] text-center" style={{ color: "#737373" }}>
                          {v(copy.reassurance)}
                        </p>
                      </Panel>
                    </>
                  );
                })()
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
