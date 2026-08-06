"use client";

/**
 * Modal "Generar link de pago" - flujo del closer/CEO.
 *
 * Comportamiento:
 *  1. Al abrir, consulta /api/leads/[id]/active-sale para ver si ya hay link
 *     pendiente. Si lo hay, lo muestra con opción de "anular y crear otro".
 *  2. Si no hay link activo, muestra wizard de 2 pasos: programa → duración.
 *  3. Tras crear el link:
 *     - Si el lead tiene teléfono → abre WhatsApp directo con mensaje plantilla.
 *     - Si no → muestra modal con botón "Copiar link".
 */
import { useEffect, useState } from "react";

type Lead = {
  id: string;
  fullName: string;
  contactType: string;
  contactValue: string;
};

type ActiveSale = {
  id: string;
  paymentToken: string;
  landingUrl: string;
  productCode: string;
  productLabel: string;
  amountCents: number;
  currency: string;
  tokenExpiresAt: string;
  createdAt: string;
};

type ProgramType = "RECUPERA" | "CONSOLIDA" | "PREVENTION";
type Duration = 4 | 6;
type PreventionPlan = "quarterly" | "semiannual" | "annual";

const PREVENTION_PLAN_LABELS: Record<PreventionPlan, string> = {
  quarterly: "3 meses",
  semiannual: "6 meses",
  annual: "12 meses",
};

/**
 * Dominio del link de pago. En producción es el dominio real; en un preview
 * de Vercel (feature branch) usamos el dominio actual del navegador, así
 * los links generados durante testing van al preview y no a producción.
 */
const APP_BASE_URL = (() => {
  if (typeof window === "undefined") return "https://app.fisiofitteam.com";
  const { origin } = window.location;
  if (origin.includes("localhost") || origin.includes(".vercel.app")) {
    return origin;
  }
  return "https://app.fisiofitteam.com";
})();

export function PaymentLinkModal({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  // Estados del wizard
  const [step, setStep] = useState<"loading" | "existing" | "program" | "duration" | "price" | "prevention-plan" | "result">("loading");
  const [program, setProgram] = useState<ProgramType | null>(null);
  const [duration, setDuration] = useState<Duration | null>(null);
  const [preventionPlan, setPreventionPlan] = useState<PreventionPlan | null>(null);
  // Precio personalizable (en euros). Se prellena con el default Stripe cuando se entra al paso "price".
  const [priceEuros, setPriceEuros] = useState<string>("");
  const [priceSuggested, setPriceSuggested] = useState<number | null>(null); // en céntimos
  const [loadingPrice, setLoadingPrice] = useState(false);
  // Fraccionamiento (null = pago único; 2..12 = N cuotas mensuales vía PayPal Subscription)
  const [installmentCount, setInstallmentCount] = useState<number | null>(null);

  // Datos del Sale
  const [activeSale, setActiveSale] = useState<ActiveSale | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [generatedLabel, setGeneratedLabel] = useState<string | null>(null);

  // UI
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Al montar: comprobar si ya hay un Sale activo ────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/leads/${lead.id}/active-sale`);
        const data = await res.json();
        if (cancelled) return;
        if (data.activeSale) {
          setActiveSale(data.activeSale);
          setStep("existing");
        } else {
          setStep("program");
        }
      } catch {
        if (!cancelled) setStep("program");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lead.id]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function buildWhatsAppLink(fullUrl: string, programLabel: string, months: number): string | null {
    if (lead.contactType !== "phone") return null;
    // Normalizar teléfono: dejar solo dígitos y +
    const raw = lead.contactValue.replace(/[^\d+]/g, "");
    if (!raw) return null;
    const message = `Hola ${lead.fullName.split(" ")[0]}, aquí tienes tu link para el programa ${programLabel} de ${months} meses: ${fullUrl}`;
    return `https://wa.me/${raw.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`;
  }

  function fullUrl(landingUrl: string): string {
    return `${APP_BASE_URL}${landingUrl}`;
  }

  // ── Acción: anular el sale activo y crear uno nuevo ──────────────────────
  async function cancelExistingAndStartOver() {
    if (!activeSale) return;
    setWorking(true);
    setError("");
    try {
      const res = await fetch(`/api/sales/${activeSale.id}/cancel`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo anular el link");
      }
      setActiveSale(null);
      setStep("program");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  // ── Acción: ir al paso de precio (consulta sugerencia Stripe) ──────────
  async function goToPriceStep() {
    if (!program || !duration) return;
    const productCode = `${program}_${duration}M`;
    setError("");
    setStep("price");
    setLoadingPrice(true);
    try {
      const r = await fetch(`/api/products/price-suggestion?productCode=${productCode}`);
      const data = await r.json();
      if (typeof data?.amountCents === "number") {
        setPriceSuggested(data.amountCents);
        setPriceEuros((data.amountCents / 100).toFixed(2).replace(".", ","));
      } else {
        setPriceSuggested(null);
        setPriceEuros("");
      }
    } catch {
      setPriceSuggested(null);
      setPriceEuros("");
    } finally {
      setLoadingPrice(false);
    }
  }

  // ── Acción: crear el Sale con programa+duración+precio seleccionados ────
  async function generate() {
    if (!program || !duration) return;
    const productCode = `${program}_${duration}M` as `${ProgramType}_${Duration}M`;
    const amountEuros = Number((priceEuros ?? "").replace(",", "."));
    if (!Number.isFinite(amountEuros) || amountEuros <= 0) {
      setError("Indica un importe válido (> 0).");
      return;
    }
    setWorking(true);
    setError("");
    try {
      const res = await fetch(`/api/leads/${lead.id}/generate-payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productCode, amountEuros, installmentCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo generar el link");

      const url = fullUrl(data.landingUrl);
      setGeneratedLink(url);
      setGeneratedLabel(data.productLabel);

      // Si tiene teléfono, abrir WhatsApp en pestaña nueva
      const programLabelShort = program;
      const wa = buildWhatsAppLink(url, programLabelShort, duration);
      if (wa) {
        window.open(wa, "_blank", "noopener,noreferrer");
      }
      setStep("result");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  // ── Acción: crear link Prevention (Stripe subscription) ─────────────
  async function generatePreventionLink() {
    if (!preventionPlan) return;
    setWorking(true);
    setError("");
    try {
      const res = await fetch(`/api/leads/${lead.id}/generate-prevention-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: preventionPlan }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo generar el link");

      setGeneratedLink(data.url);
      setGeneratedLabel(data.productLabel);

      // Si tiene teléfono, abrir WhatsApp con mensaje precargado
      const wa = buildPreventionWhatsAppLink(data.url, PREVENTION_PLAN_LABELS[preventionPlan]);
      if (wa) window.open(wa, "_blank", "noopener,noreferrer");

      setStep("result");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  function buildPreventionWhatsAppLink(paymentUrl: string, planLabel: string): string | null {
    if (lead.contactType !== "phone") return null;
    const raw = lead.contactValue.replace(/[^\d+]/g, "");
    if (!raw) return null;
    const first = lead.fullName.split(" ")[0] || "";
    const msg =
      `¡Hola ${first}! 👋\n\n` +
      `Aquí tienes el link para suscribirte a FisioFit Prevention (${planLabel}):\n\n` +
      `${paymentUrl}\n\n` +
      `En cuanto completes el pago tendrás acceso inmediato. Cualquier duda, me dices.`;
    return `https://wa.me/${raw.replace(/^\+/, "")}?text=${encodeURIComponent(msg)}`;
  }

  // ── Copiar al portapapeles ───────────────────────────────────────────────
  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar al portapapeles");
    }
  }

  // ── Helpers visuales ─────────────────────────────────────────────────────
  const formatAmount = (cents: number, currency: string) =>
    `${(cents / 100).toFixed(2).replace(".", ",")} ${currency.toUpperCase() === "EUR" ? "€" : currency.toUpperCase()}`;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-medium">💳 Link de pago</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">{lead.fullName}</p>

        {/* ── Loading inicial ────────────────────────────────────────────── */}
        {step === "loading" && (
          <div className="py-8 text-center text-sm text-neutral-500">Cargando...</div>
        )}

        {/* ── Sale pending existente ─────────────────────────────────────── */}
        {step === "existing" && activeSale && (
          <div className="space-y-3">
            <div className="rounded-lg p-3" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
              <p className="text-sm font-medium" style={{ color: "#92400E" }}>
                Ya hay un link activo
              </p>
              <p className="text-xs mt-1" style={{ color: "#78350F" }}>
                {activeSale.productLabel} · {formatAmount(activeSale.amountCents, activeSale.currency)}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "#78350F" }}>
                Caduca: {formatDate(activeSale.tokenExpiresAt)}
              </p>
            </div>

            <div>
              <label className="text-xs text-neutral-500 block mb-1">URL del link</label>
              <div className="flex gap-2">
                <input
                  className="input text-xs flex-1"
                  value={fullUrl(activeSale.landingUrl)}
                  readOnly
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => copyToClipboard(fullUrl(activeSale.landingUrl))}
                  className="btn btn-primary text-xs whitespace-nowrap"
                >
                  {copied ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
            </div>

            {lead.contactType === "phone" && (
              <a
                href={buildWhatsAppLink(fullUrl(activeSale.landingUrl), activeSale.productCode.split("_")[0], parseInt(activeSale.productCode.split("_")[1])) || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-accent w-full text-sm text-center block"
              >
                💬 Abrir WhatsApp con el mensaje
              </a>
            )}

            <button
              onClick={cancelExistingAndStartOver}
              disabled={working}
              className="btn w-full text-sm text-red-600 border border-red-200 hover:bg-red-50"
            >
              {working ? "Anulando..." : "Anular este link y crear uno nuevo"}
            </button>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
            )}
          </div>
        )}

        {/* ── Paso 1: elegir programa ────────────────────────────────────── */}
        {step === "program" && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-700">¿Qué programa va a contratar?</p>
            <div className="grid grid-cols-1 gap-2">
              {[
                { value: "RECUPERA",   label: "RECUPERA",              desc: "Recupera tu rendimiento sin dolor" },
                { value: "CONSOLIDA",  label: "CONSOLIDA",             desc: "Mantén la mejora y consolida resultados" },
                { value: "PREVENTION", label: "FisioFit Prevention 🛡", desc: "Suscripción recurrente · 4 días de prueba" },
              ].map((p) => (
                <button
                  key={p.value}
                  onClick={() => {
                    setProgram(p.value as ProgramType);
                    setStep(p.value === "PREVENTION" ? "prevention-plan" : "duration");
                  }}
                  className="text-left px-4 py-3 rounded-lg border border-neutral-200 hover:border-neutral-900 hover:bg-neutral-50 transition"
                >
                  <div className="font-medium text-sm">{p.label}</div>
                  <div className="text-xs text-neutral-500">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Paso Prevention: elegir plan (3/6/12 meses) ────────────────── */}
        {step === "prevention-plan" && program === "PREVENTION" && (
          <div className="space-y-3">
            <button
              onClick={() => { setProgram(null); setPreventionPlan(null); setError(""); setStep("program"); }}
              className="text-xs text-neutral-500 hover:text-neutral-900"
            >
              ← Cambiar programa
            </button>
            <p className="text-sm text-neutral-700">
              <strong>FisioFit Prevention 🛡</strong>. ¿Qué compromiso?
            </p>
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(PREVENTION_PLAN_LABELS) as PreventionPlan[]).map((pl) => (
                <button
                  key={pl}
                  onClick={() => setPreventionPlan(pl)}
                  className={`px-4 py-3 rounded-lg border font-medium text-sm text-left ${
                    preventionPlan === pl
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "bg-white border-neutral-200 hover:bg-neutral-50"
                  }`}
                >
                  {PREVENTION_PLAN_LABELS[pl]}
                  {pl === "annual" && <span className="ml-2 text-[10px] uppercase tracking-wider opacity-70">Mejor precio</span>}
                </button>
              ))}
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
            )}
            <button
              onClick={generatePreventionLink}
              disabled={!preventionPlan || working}
              className="btn btn-accent w-full text-sm"
            >
              {working ? "Generando link..." : "Generar link de suscripción"}
            </button>
            <p className="text-[11px] text-neutral-500 italic">
              Pago directo (sin prueba de 4 días — eso queda para la landing pública). Al confirmarse, el lead queda vinculado a ti como cierre y el atleta recibe acceso inmediato.
            </p>
          </div>
        )}

        {/* ── Paso 2: elegir duración ────────────────────────────────────── */}
        {step === "duration" && program && (
          <div className="space-y-3">
            <button
              onClick={() => {
                setProgram(null);
                setStep("program");
              }}
              className="text-xs text-neutral-500 hover:text-neutral-900"
            >
              ← Cambiar programa
            </button>
            <p className="text-sm text-neutral-700">
              Programa: <strong>{program}</strong>. ¿Qué duración?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[4, 6].map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d as Duration)}
                  className={`px-4 py-3 rounded-lg border font-medium ${
                    duration === d
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "bg-white border-neutral-200 hover:bg-neutral-50"
                  }`}
                >
                  {d} meses
                </button>
              ))}
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
            )}

            <button
              onClick={goToPriceStep}
              disabled={!duration}
              className="btn btn-accent w-full text-sm"
            >
              Siguiente: precio →
            </button>
          </div>
        )}

        {/* ── Paso 3: precio personalizable ───────────────────────────────── */}
        {step === "price" && program && duration && (
          <div className="space-y-3">
            <button
              onClick={() => { setStep("duration"); setError(""); }}
              className="text-xs text-neutral-500 hover:text-neutral-900"
            >
              ← Cambiar duración
            </button>
            <p className="text-sm text-neutral-700">
              <strong>{program}</strong> · {duration} meses. ¿Qué precio le pones?
            </p>

            {loadingPrice && (
              <div className="text-xs text-neutral-400 italic">Consultando precio sugerido…</div>
            )}

            {!loadingPrice && priceSuggested !== null && (
              <div className="text-[11px] text-neutral-500">
                Precio sugerido (Stripe): <strong>{(priceSuggested / 100).toFixed(2).replace(".", ",")} €</strong>. Puedes cambiarlo abajo.
              </div>
            )}

            <div>
              <label className="text-xs text-neutral-500 block mb-1">Importe TOTAL a cobrar (€)</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  className="input flex-1"
                  value={priceEuros}
                  onChange={(e) => setPriceEuros(e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="Ej: 749 o 749,00"
                  autoFocus
                />
                <span className="text-sm text-neutral-500">€</span>
              </div>
            </div>

            {/* Fraccionamiento en N cuotas (PayPal Subscription) */}
            <div>
              <label className="text-xs text-neutral-500 block mb-1">¿Cómo lo cobramos?</label>
              <div className="grid grid-cols-5 gap-1.5">
                {[null, 2, 3, 4, 6].map((n) => {
                  const active = installmentCount === n;
                  const label = n === null ? "1 pago" : `${n} cuotas`;
                  return (
                    <button
                      key={n ?? "one"}
                      onClick={() => setInstallmentCount(n)}
                      className={`px-2 py-2 rounded-lg border text-xs font-medium ${
                        active
                          ? "bg-neutral-900 text-white border-neutral-900"
                          : "bg-white border-neutral-200 hover:bg-neutral-50"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {installmentCount !== null && priceEuros.trim() && (() => {
                const total = Number((priceEuros ?? "").replace(",", "."));
                if (!Number.isFinite(total) || total <= 0) return null;
                const perCycle = (total / installmentCount).toFixed(2).replace(".", ",");
                return (
                  <p className="text-[11px] text-neutral-500 italic mt-1.5">
                    PayPal cobrará {installmentCount} × {perCycle} € mensuales.
                    El cliente firma la suscripción al aprobar el primer cobro.
                  </p>
                );
              })()}
              {installmentCount === null && (
                <p className="text-[11px] text-neutral-500 italic mt-1.5">
                  Pago único. PayPal ofrecerá "Paga en 3 plazos" si el cliente califica.
                </p>
              )}
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
            )}

            <button
              onClick={generate}
              disabled={working || !priceEuros.trim()}
              className="btn btn-accent w-full text-sm"
            >
              {working ? "Generando link…" : "Generar link de pago"}
            </button>
          </div>
        )}

        {/* ── Resultado: link generado ───────────────────────────────────── */}
        {step === "result" && generatedLink && (
          <div className="space-y-3">
            <div className="rounded-lg p-3" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <p className="text-sm font-medium" style={{ color: "#065F46" }}>
                ✓ Link generado
              </p>
              <p className="text-xs mt-1" style={{ color: "#047857" }}>
                {generatedLabel} · válido durante 3 días
              </p>
            </div>

            {lead.contactType === "phone" && (
              <div className="rounded-lg p-3 text-xs" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1E3A8A" }}>
                📱 Te he abierto WhatsApp en otra pestaña con el mensaje listo. Si no se ha abierto, copia el link abajo.
              </div>
            )}

            <div>
              <label className="text-xs text-neutral-500 block mb-1">URL del link</label>
              <div className="flex gap-2">
                <input
                  className="input text-xs flex-1"
                  value={generatedLink}
                  readOnly
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => copyToClipboard(generatedLink)}
                  className="btn btn-primary text-xs whitespace-nowrap"
                >
                  {copied ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
            </div>

            <button onClick={onClose} className="btn w-full text-sm">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
