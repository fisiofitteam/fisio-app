"use client";

import { useState } from "react";

type Plan = {
  key: "quarterly" | "semiannual" | "annual";
  label: string;
  months: number;
  amountEuros: number;
  monthlyEffectiveEuros: number;
  isHighlighted: boolean;
};

/**
 * Landing pública de FisioFit Prevention. La CEO la pasará manualmente al
 * lead (no hay SEO/CAC público). Objetivo: convertir de un vistazo.
 * Tres tarjetas de precio, el semestral con badge "Más elegido",
 * pequeña FAQ y el checkout en un click.
 */
export function PreventionLanding({
  plans,
  trialDays,
  cancelled,
}: {
  plans: Plan[];
  trialDays: number;
  cancelled?: boolean;
}) {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      {/* Cabecera fija minimal */}
      <header className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ letterSpacing: "-0.02em" }}>
          <span>🛡</span>
          <span>
            FisioFit <span className="text-emerald-600">Prevention</span>
          </span>
        </div>
        <a
          href="#planes"
          className="text-xs font-medium px-3 py-1.5 rounded-full text-white"
          style={{ background: "linear-gradient(135deg, #10B981 0%, #059669 100%)" }}
        >
          Ver planes →
        </a>
      </header>

      {cancelled && (
        <div className="max-w-3xl mx-auto px-5 pt-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3">
            Has cancelado el proceso. Cuando quieras volver, elige un plan aquí abajo. Sin compromiso.
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-5 pt-10 pb-8 text-center">
        <div className="inline-flex items-center text-[11px] font-bold tracking-wider px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase mb-4">
          Servicio recurrente · desde 17 €/mes
        </div>
        <h1
          className="text-4xl sm:text-5xl font-bold leading-tight"
          style={{ letterSpacing: "-0.03em" }}
        >
          Cuídate en 15 minutos al día.
        </h1>
        <p className="text-lg text-neutral-600 mt-4 max-w-2xl mx-auto leading-relaxed">
          Rolling semanal de movilidad, técnica y activación diseñado para
          atletas de CrossFit y Hyrox que ya están sanos y quieren
          <strong> mantenerse ahí.</strong> Sin pasos, sin excusas, sin sobre-entrenar.
        </p>
        <p className="text-sm text-neutral-500 mt-3">
          {trialDays} días gratis. Cancela cuando quieras.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <a
            href="#planes"
            className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-3 rounded-xl text-white shadow-sm"
            style={{ background: "linear-gradient(135deg, #10B981 0%, #059669 100%)" }}
          >
            Empezar ahora →
          </a>
          <a href="#preguntas" className="text-sm text-neutral-500 hover:underline">
            ¿Cómo funciona?
          </a>
        </div>
      </section>

      {/* Bloque de valor */}
      <section className="max-w-4xl mx-auto px-5 py-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ValueCard emoji="🧘" title="15 min al día">
          Micro-sesiones diarias de lunes a viernes. Se integran en tu warm-up o cool-down. No pierdes tiempo.
        </ValueCard>
        <ValueCard emoji="🎥" title="Vídeos de referencia">
          Cada ejercicio con su vídeo de técnica. Nunca dudas cómo se hace.
        </ValueCard>
        <ValueCard emoji="🔄" title="Se actualiza cada semana">
          Programación viva. No es un curso estático — evoluciona contigo.
        </ValueCard>
      </section>

      {/* Planes */}
      <section id="planes" className="max-w-5xl mx-auto px-5 py-10">
        <h2
          className="text-3xl sm:text-4xl font-bold text-center mb-2"
          style={{ letterSpacing: "-0.02em" }}
        >
          Elige tu plan
        </h2>
        <p className="text-center text-neutral-500 mb-8 max-w-xl mx-auto">
          Puedes cancelar cuando quieras. Los primeros {trialDays} días son gratis y no cobramos si cancelas antes.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => (
            <PlanCard key={p.key} plan={p} trialDays={trialDays} />
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="preguntas" className="max-w-2xl mx-auto px-5 py-14 space-y-3">
        <h2
          className="text-2xl sm:text-3xl font-bold text-center mb-6"
          style={{ letterSpacing: "-0.02em" }}
        >
          Preguntas frecuentes
        </h2>
        <FaqItem q={`¿Cómo funcionan los ${trialDays} días gratis?`}>
          Introduces tu método de pago pero no se cobra nada durante los primeros{" "}
          {trialDays} días. Puedes cancelar en cualquier momento antes de que termine la prueba y no se hará ningún cargo.
        </FaqItem>
        <FaqItem q="¿Puedo cancelar cuando quiera?">
          Sí. Desde tu panel puedes cancelar la renovación con un click. Mantienes el acceso hasta el final del periodo ya pagado.
        </FaqItem>
        <FaqItem q="¿Qué diferencia hay con RECUPERA o CONSOLIDA?">
          Prevention es un servicio recurrente low-ticket para gente ya sana que quiere mantenerse. No hay fisio asignado ni seguimiento personalizado — es contenido rolling con vídeos. Si tienes una lesión o quieres acompañamiento 1:1, cuéntanoslo y te derivamos al programa RECUPERA o CONSOLIDA.
        </FaqItem>
        <FaqItem q="¿Puedo consultar con un fisio si me surge algo?">
          Sí. Desde la app puedes reservar una consulta de 45 min por 17 € cuando lo necesites. Sin compromiso de continuidad.
        </FaqItem>
        <FaqItem q="¿Se renueva automáticamente?">
          Sí, para que no te quedes sin acceso por olvido. Te avisamos con 7 días de antelación por email y siempre puedes desactivar la renovación desde tu panel.
        </FaqItem>
      </section>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-5 py-10 text-center text-xs text-neutral-400 border-t border-neutral-100">
        <div className="mb-1">
          © {new Date().getFullYear()} FisioFit Team · fisiofitteam.com
        </div>
        <div className="flex items-center justify-center gap-3">
          <a href="/privacidad" className="hover:text-neutral-700 hover:underline">Privacidad</a>
          <span>·</span>
          <a href="/terminos" className="hover:text-neutral-700 hover:underline">Términos</a>
        </div>
      </footer>
    </main>
  );
}

function ValueCard({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-5">
      <div className="text-3xl mb-2">{emoji}</div>
      <div className="font-semibold text-base mb-1" style={{ letterSpacing: "-0.01em" }}>
        {title}
      </div>
      <p className="text-sm text-neutral-600 leading-relaxed">{children}</p>
    </div>
  );
}

function PlanCard({ plan, trialDays }: { plan: Plan; trialDays: number }) {
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const isHighlight = plan.isHighlighted;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/prevention/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.key, email, fullName }),
      });
      const d = await res.json();
      if (!res.ok || !d.url) throw new Error(d?.error || "No pudimos iniciar el pago");
      window.location.href = d.url;
    } catch (e: any) {
      setErr(e?.message ?? "Error de red");
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-2xl p-5 flex flex-col ${
        isHighlight ? "shadow-lg ring-2 ring-emerald-500" : "border border-neutral-200"
      }`}
      style={{ background: "#FFFFFF", position: "relative" }}
    >
      {isHighlight && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-wider text-white px-2.5 py-1 rounded-full uppercase"
          style={{ background: "linear-gradient(135deg, #10B981 0%, #059669 100%)" }}
        >
          Más elegido
        </div>
      )}

      <div className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-1">
        {plan.label}
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span
          className="text-4xl font-bold tabular-nums"
          style={{ letterSpacing: "-0.02em", color: isHighlight ? "#10B981" : "#0A0A0A" }}
        >
          {plan.amountEuros}
        </span>
        <span className="text-sm text-neutral-500 font-medium">€</span>
      </div>
      <div className="text-xs text-neutral-500 mb-4">
        Cada {plan.months} meses · ≈ {plan.monthlyEffectiveEuros.toFixed(2)} €/mes
      </div>

      <ul className="text-sm text-neutral-700 space-y-1.5 mb-5 flex-1">
        <li>✅ Contenido semanal renovado</li>
        <li>✅ Vídeos de cada ejercicio</li>
        <li>✅ Comunidad + reto del mes</li>
        <li>✅ {trialDays} días gratis</li>
        <li>✅ Cancela cuando quieras</li>
      </ul>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className={`w-full text-sm font-semibold py-3 rounded-xl transition-transform active:scale-[0.98] ${
            isHighlight ? "text-white shadow-md" : "border border-neutral-200 bg-white hover:bg-neutral-50"
          }`}
          style={
            isHighlight
              ? { background: "linear-gradient(135deg, #10B981 0%, #059669 100%)" }
              : undefined
          }
        >
          Empezar {plan.label.toLowerCase()}
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
          {err && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
              ⚠ {err}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !email || !fullName}
            className={`w-full text-sm font-semibold py-3 rounded-xl disabled:opacity-50 ${
              isHighlight ? "text-white" : "bg-neutral-900 text-white"
            }`}
            style={
              isHighlight
                ? { background: "linear-gradient(135deg, #10B981 0%, #059669 100%)" }
                : undefined
            }
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

function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-neutral-200 bg-white">
      <summary className="cursor-pointer list-none flex items-center justify-between p-4 gap-2">
        <span className="text-sm font-semibold">{q}</span>
        <span
          className="text-neutral-400 text-lg leading-none transition-transform group-open:rotate-45"
          aria-hidden
        >
          +
        </span>
      </summary>
      <div className="px-4 pb-4 text-sm text-neutral-600 leading-relaxed">{children}</div>
    </details>
  );
}
