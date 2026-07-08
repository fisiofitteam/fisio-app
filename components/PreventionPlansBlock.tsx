"use client";

import { useState } from "react";

export type PreventionPlanCardData = {
  key: "quarterly" | "semiannual" | "annual";
  label: string;
  months: number;
  amountEuros: number;
  monthlyEffectiveEuros: number;
  isHighlighted: boolean;
};

/**
 * Bloque interactivo de los 3 planes de Prevention con checkout inline.
 * Se usa en la landing tanto en modo "structured" (dentro del layout
 * completo) como en modo "html" (embebido por el placeholder [[PLANS]]).
 *
 * En modo HTML libre, el usuario del editor puede envolver este bloque
 * en la maquetación que quiera — este componente solo pinta los 3
 * cards y gestiona el submit al checkout de Stripe.
 */
export function PreventionPlansBlock({
  plans,
  trialDays,
  bullets,
  highlightBadgeLabel,
  ctaTemplate,
  gradient,
  brandPrimary,
}: {
  plans: PreventionPlanCardData[];
  trialDays: number;
  bullets: string[];
  highlightBadgeLabel: string;
  ctaTemplate: string;
  gradient: string;
  brandPrimary: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {plans.map((p) => (
        <PlanCard
          key={p.key}
          plan={p}
          trialDays={trialDays}
          bullets={bullets}
          highlightBadgeLabel={highlightBadgeLabel}
          ctaTemplate={ctaTemplate}
          gradient={gradient}
          brandPrimary={brandPrimary}
        />
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  trialDays: _trialDays,
  bullets,
  highlightBadgeLabel,
  ctaTemplate,
  gradient,
  brandPrimary,
}: {
  plan: PreventionPlanCardData;
  trialDays: number;
  bullets: string[];
  highlightBadgeLabel: string;
  ctaTemplate: string;
  gradient: string;
  brandPrimary: string;
}) {
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const isHighlight = plan.isHighlighted;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
      setErr("El WhatsApp no parece válido. Incluye el prefijo del país (ej. +34).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/prevention/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.key, email, fullName, phone }),
      });
      const d = await res.json();
      if (!res.ok || !d.url) throw new Error(d?.error || "No pudimos iniciar el pago");
      window.location.href = d.url;
    } catch (e: any) {
      setErr(e?.message ?? "Error de red");
      setBusy(false);
    }
  }

  const ctaLabel = ctaTemplate.replace(/\{plan\}/g, plan.label.toLowerCase());

  const inputStyle: React.CSSProperties = {
    background: "rgba(10, 10, 10, 0.6)",
    border: "1px solid #333",
    color: "#FAFAFA",
  };
  return (
    <div
      className="rounded-2xl p-5 flex flex-col relative transition-transform hover:-translate-y-0.5"
      style={{
        background: "rgba(20, 20, 20, 0.88)",
        backdropFilter: "blur(8px)",
        border: isHighlight ? `2px solid ${brandPrimary}` : "1px solid #262626",
        boxShadow: isHighlight ? `0 12px 32px -8px ${brandPrimary}66` : undefined,
      }}
    >
      {isHighlight && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-wider text-white px-2.5 py-1 rounded-full uppercase"
          style={{ background: gradient }}
        >
          {highlightBadgeLabel}
        </div>
      )}

      <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#A3A3A3" }}>
        {plan.label}
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span
          className="text-5xl font-bold tabular-nums"
          style={{ letterSpacing: "-0.03em", color: isHighlight ? brandPrimary : "#FAFAFA" }}
        >
          {plan.amountEuros}
        </span>
        <span className="text-base font-medium" style={{ color: "#737373" }}>€</span>
      </div>
      <div className="text-[11px] mb-5" style={{ color: "#737373" }}>
        Cada {plan.months} meses · ≈ {plan.monthlyEffectiveEuros.toFixed(2)} €/mes
      </div>

      <ul className="text-sm space-y-2 mb-6 flex-1" style={{ color: "#D4D4D4" }}>
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2">
            <span style={{ color: brandPrimary, marginTop: 2 }}>✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full text-sm font-semibold py-3 rounded-xl transition-transform active:scale-[0.98]"
          style={
            isHighlight
              ? { background: gradient, color: "#FFFFFF", boxShadow: `0 8px 20px -6px ${brandPrimary}80` }
              : { background: "rgba(250, 250, 250, 0.06)", color: "#FAFAFA", border: "1px solid #333" }
          }
        >
          {ctaLabel}
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <input
            type="text"
            required
            placeholder="Tu nombre"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg outline-none focus:border-neutral-400 placeholder:text-neutral-500"
            style={inputStyle}
          />
          <input
            type="email"
            required
            placeholder="Tu email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg outline-none focus:border-neutral-400 placeholder:text-neutral-500"
            style={inputStyle}
          />
          <input
            type="tel"
            required
            placeholder="WhatsApp (ej. +34 600 123 456)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg outline-none focus:border-neutral-400 placeholder:text-neutral-500"
            style={inputStyle}
            inputMode="tel"
            autoComplete="tel"
          />
          {err && (
            <div
              className="text-xs rounded-lg px-2 py-1.5"
              style={{
                background: "rgba(220, 38, 38, 0.15)",
                border: "1px solid rgba(220, 38, 38, 0.4)",
                color: "#FCA5A5",
              }}
            >
              ⚠ {err}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !email || !fullName || !phone}
            className="w-full text-sm font-semibold py-3 rounded-xl disabled:opacity-50"
            style={{ background: gradient, color: "#FFFFFF" }}
          >
            {busy ? "Redirigiendo…" : "Ir a pago seguro (Stripe) →"}
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(false); setErr(null); }}
            className="w-full text-[11px] hover:underline"
            style={{ color: "#737373" }}
          >
            Cambiar plan
          </button>
        </form>
      )}
    </div>
  );
}
