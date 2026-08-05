"use client";

import { useEffect, useState } from "react";
import type { ContractLandingCopy } from "@/lib/landing-content";

type SaleInfo = {
  status: string;
  leadName: string;
  leadEmail: string;
  productCode: string;
  programType: "RECUPERA" | "CONSOLIDA";
  durationMonths: number;
  label: string;
  amountCents: number;
  currency: string;
  installmentCount: number | null;
};

function formatEuros(cents: number): string {
  const euros = cents / 100;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: euros % 1 === 0 ? 0 : 2,
  }).format(euros);
}

export function ContractLandingClient({ token, copy }: { token: string; copy: ContractLandingCopy }) {
  const [sale, setSale] = useState<SaleInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/sale/${token}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "No se pudo cargar el link");
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (data.status === "paid") {
          setError("Este pago ya está completado. Si necesitas acceso, escríbenos.");
          setLoading(false);
          return;
        }
        setSale(data);
        setLoading(false);
      } catch (e: any) {
        setError(e.message || "Error de conexión");
        setLoading(false);
      }
    })();
  }, [token]);

  async function startCheckout() {
    setSubmitting(true);
    try {
      // Endpoint PayPal (migración desde Stripe agosto 2026).
      const res = await fetch(`/api/sale/${token}/paypal`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "No se pudo iniciar el pago");
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message || "Error al iniciar el pago");
      setSubmitting(false);
    }
  }

  const headline = sale ? (copy.programs[sale.programType] ?? copy.programs.RECUPERA) : null;

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
          {/* Loading */}
          {loading && (
            <div
              className="rounded-2xl p-8 text-center"
              style={{
                background: "rgba(20, 20, 20, 0.85)",
                border: "1px solid #262626",
                backdropFilter: "blur(8px)",
              }}
            >
              <p className="text-sm" style={{ color: "#A3A3A3" }}>
                Cargando tu programa...
              </p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div
              className="rounded-2xl p-6 text-center"
              style={{
                background: "rgba(127, 29, 29, 0.25)",
                border: "1px solid #7F1D1D",
                backdropFilter: "blur(8px)",
              }}
            >
              <p className="text-sm" style={{ color: "#FCA5A5" }}>
                {error}
              </p>
              <p className="text-xs mt-3" style={{ color: "#A3A3A3" }}>
                Si crees que es un error, escríbenos al WhatsApp.
              </p>
            </div>
          )}

          {/* Contenido principal */}
          {sale && !loading && !error && headline && (
            <>
              {/* Saludo personalizado */}
              <div className="text-center mb-8">
                <p className="text-sm uppercase tracking-widest mb-2" style={{ color: "#737373" }}>
                  Hola, {sale.leadName.split(" ")[0]} 👋
                </p>
                <h1
                  className="text-3xl sm:text-4xl font-bold mb-2 tracking-tight"
                  style={{ color: "#FAFAFA" }}
                >
                  {copy.headline}
                </h1>
                <p className="text-sm" style={{ color: "#A3A3A3" }}>
                  {copy.subheadline}
                </p>
              </div>

              {/* Card principal */}
              <div
                className="rounded-2xl p-6 sm:p-8 mb-6"
                style={{
                  background: "rgba(20, 20, 20, 0.85)",
                  border: "1px solid #262626",
                  backdropFilter: "blur(8px)",
                }}
              >
                {/* Badge programa */}
                <div className="flex items-center justify-between mb-5">
                  <span
                    className="inline-block px-3 py-1 rounded-full text-[10px] font-semibold tracking-wider"
                    style={{
                      background:
                        sale.programType === "RECUPERA"
                          ? "rgba(168, 85, 247, 0.15)"
                          : "rgba(59, 130, 246, 0.15)",
                      color: sale.programType === "RECUPERA" ? "#C084FC" : "#60A5FA",
                      border: `1px solid ${
                        sale.programType === "RECUPERA" ? "#7C3AED" : "#2563EB"
                      }`,
                    }}
                  >
                    {headline.title.toUpperCase()}
                  </span>
                  <span
                    className="inline-block px-2.5 py-1 rounded-md text-[10px] font-semibold"
                    style={{
                      background: "rgba(255, 212, 0, 0.1)",
                      color: "#FFD400",
                      border: "1px solid rgba(255, 212, 0, 0.3)",
                    }}
                  >
                    {sale.durationMonths} MESES
                  </span>
                </div>

                {/* Title + subtitle */}
                <h2
                  className="text-2xl sm:text-3xl font-bold mb-1 tracking-tight"
                  style={{ color: "#FAFAFA" }}
                >
                  {headline.title}
                </h2>
                <p className="text-sm mb-6" style={{ color: "#A3A3A3" }}>
                  {headline.subtitle}
                </p>

                {/* Lista beneficios */}
                <ul className="space-y-2.5 mb-6">
                  {headline.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: "#D4D4D4" }}>
                      <span style={{ color: "#FFD400" }}>✓</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                {/* Separador */}
                <div
                  className="my-6 h-px"
                  style={{ background: "linear-gradient(to right, transparent, #404040, transparent)" }}
                />

                {/* Precio */}
                <div className="flex items-baseline justify-between mb-6">
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "#737373" }}>
                      Total
                    </p>
                    <p className="text-3xl font-bold tabular-nums" style={{ color: "#FAFAFA" }}>
                      {formatEuros(sale.amountCents)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "#737373" }}>
                      Duración
                    </p>
                    <p className="text-lg font-semibold tabular-nums" style={{ color: "#FAFAFA" }}>
                      {sale.durationMonths} meses
                    </p>
                  </div>
                </div>

                {/* Botón pago (copy cambia si es suscripción de N cuotas) */}
                {(() => {
                  const n = sale.installmentCount;
                  const isSub = typeof n === "number" && n >= 2;
                  const perCycleCents = isSub ? Math.round(sale.amountCents / n) : sale.amountCents;
                  const buttonLabel = isSub
                    ? `Suscribirme por ${formatEuros(perCycleCents)}/mes (${n} meses) →`
                    : `Pagar ${formatEuros(sale.amountCents)} →`;
                  const footerCopy = isSub
                    ? `${n} cuotas mensuales vía PayPal · Total ${formatEuros(sale.amountCents)} · Pago seguro`
                    : "PayPal, tarjeta o Paga en 3 plazos sin intereses · Pago seguro";
                  return (
                    <>
                      <button
                        onClick={startCheckout}
                        disabled={submitting}
                        className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-tight transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: "#FFD400", color: "#0A0A0A" }}
                      >
                        {submitting ? "Redirigiendo a pago seguro..." : buttonLabel}
                      </button>
                      <div className="mt-4 text-center">
                        <p className="text-[11px]" style={{ color: "#737373" }}>
                          {footerCopy}
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Footer pequeño */}
              <div className="text-center">
                <p className="text-[11px]" style={{ color: "#525252" }}>
                  {copy.footer}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
