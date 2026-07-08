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

  return (
    <div
      className={`rounded-2xl p-5 flex flex-col ${isHighlight ? "shadow-lg" : "border border-neutral-200"}`}
      style={{
        background: "#FFFFFF",
        position: "relative",
        ...(isHighlight
          ? { boxShadow: `0 10px 25px -5px ${brandPrimary}30`, border: `2px solid ${brandPrimary}` }
          : {}),
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

      <div className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-1">
        {plan.label}
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span
          className="text-4xl font-bold tabular-nums"
          style={{ letterSpacing: "-0.02em", color: isHighlight ? brandPrimary : "#0A0A0A" }}
        >
          {plan.amountEuros}
        </span>
        <span className="text-sm text-neutral-500 font-medium">€</span>
      </div>
      <div className="text-xs text-neutral-500 mb-4">
        Cada {plan.months} meses · ≈ {plan.monthlyEffectiveEuros.toFixed(2)} €/mes
      </div>

      <ul className="text-sm text-neutral-700 space-y-1.5 mb-5 flex-1">
        {bullets.map((b, i) => (
          <li key={i}>✅ {b}</li>
        ))}
      </ul>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className={`w-full text-sm font-semibold py-3 rounded-xl transition-transform active:scale-[0.98] ${
            isHighlight ? "text-white shadow-md" : "border border-neutral-200 bg-white hover:bg-neutral-50"
          }`}
          style={isHighlight ? { background: gradient } : undefined}
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
            className="w-full text-sm px-3 py-2 border border-neutral-200 rounded-lg focus:border-neutral-400 outline-none"
          />
          <input
            type="email"
            required
            placeholder="Tu email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full text-sm px-3 py-2 border border-neutral-200 rounded-lg focus:border-neutral-400 outline-none"
          />
          <input
            type="tel"
            required
            placeholder="WhatsApp (ej. +34 600 123 456)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full text-sm px-3 py-2 border border-neutral-200 rounded-lg focus:border-neutral-400 outline-none"
            inputMode="tel"
            autoComplete="tel"
          />
          {err && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
              ⚠ {err}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !email || !fullName || !phone}
            className={`w-full text-sm font-semibold py-3 rounded-xl disabled:opacity-50 ${
              isHighlight ? "text-white" : "bg-neutral-900 text-white"
            }`}
            style={isHighlight ? { background: gradient } : undefined}
          >
            {busy ? "Redirigiendo…" : "Ir a pago seguro (Stripe) →"}
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(false); setErr(null); }}
            className="w-full text-[11px] text-neutral-400 hover:text-neutral-700"
          >
            Cambiar plan
          </button>
        </form>
      )}
    </div>
  );
}
