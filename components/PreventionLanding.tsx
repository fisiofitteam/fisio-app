"use client";

import type { PreventionLandingCopy } from "@/lib/landing-content";
import { PreventionPlansBlock, type PreventionPlanCardData } from "@/components/PreventionPlansBlock";

function tpl(text: string, trialDays: number): string {
  return text
    .replace(/\{trialDays\}/g, String(trialDays))
    .replace(/\{year\}/g, String(new Date().getFullYear()));
}

/**
 * Landing pública de FisioFit Prevention. Look "box.jpg dark" heredado
 * de la landing de agenda (fondo con imagen del box + overlay + cards
 * translúcidas con blur). Todos los textos son editables desde
 * /fisio/advance/prevention → pestaña Landing.
 */
export function PreventionLanding({
  plans,
  trialDays,
  cancelled,
  copy,
}: {
  plans: PreventionPlanCardData[];
  trialDays: number;
  cancelled?: boolean;
  copy: PreventionLandingCopy;
}) {
  const gradient = `linear-gradient(135deg, ${copy.brandPrimary} 0%, ${copy.brandPrimaryDark} 100%)`;
  const bullets = copy.planBullets.map((b) => tpl(b, trialDays));

  return (
    <main
      className="min-h-screen relative"
      style={{
        backgroundColor: "#0A0A0A",
        backgroundImage: "url('/box.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        color: "#FAFAFA",
      }}
    >
      {/* Overlay dark para legibilidad — igual que la landing de agenda */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "rgba(10, 10, 10, 0.78)" }}
      />

      <div className="relative">
        {/* Cabecera minimal */}
        <header className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ letterSpacing: "-0.02em" }}>
            <span>🛡</span>
            <span>
              {copy.brandName} <span style={{ color: copy.brandPrimary }}>{copy.brandSuffix}</span>
            </span>
          </div>
          <a
            href="#planes"
            className="text-xs font-medium px-3 py-1.5 rounded-full text-white"
            style={{ background: gradient }}
          >
            {copy.headerCtaLabel}
          </a>
        </header>

        {cancelled && (
          <div className="max-w-3xl mx-auto px-5 pt-2">
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.35)",
                color: "#FCD34D",
              }}
            >
              Has cancelado el proceso. Cuando quieras volver, elige un plan aquí abajo. Sin compromiso.
            </div>
          </div>
        )}

        {/* Hero */}
        <section className="max-w-3xl mx-auto px-5 pt-8 sm:pt-14 pb-10 text-center">
          <div
            className="inline-flex items-center text-[11px] font-bold tracking-wider px-3 py-1 rounded-full uppercase mb-5"
            style={{
              background: `${copy.brandPrimary}22`,
              color: copy.brandPrimary,
              border: `1px solid ${copy.brandPrimary}55`,
              backdropFilter: "blur(4px)",
            }}
          >
            {tpl(copy.heroBadge, trialDays)}
          </div>
          <h1
            className="font-bold leading-none mb-5"
            style={{
              fontSize: "clamp(40px, 7vw, 68px)",
              letterSpacing: "-0.035em",
            }}
          >
            {tpl(copy.heroTitle, trialDays)}
          </h1>
          <p
            className="text-base sm:text-lg leading-relaxed max-w-2xl mx-auto whitespace-pre-line"
            style={{ color: "#A3A3A3" }}
          >
            {tpl(copy.heroSubtitle, trialDays)}
          </p>
          <p className="text-sm mt-4" style={{ color: "#737373" }}>
            {tpl(copy.heroTrialLine, trialDays)}
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <a
              href="#planes"
              className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl text-white shadow-lg transition-transform active:scale-[0.98]"
              style={{
                background: gradient,
                boxShadow: `0 10px 25px -8px ${copy.brandPrimary}80`,
              }}
            >
              {tpl(copy.heroCtaPrimary, trialDays)}
            </a>
            <a
              href="#preguntas"
              className="text-sm hover:underline"
              style={{ color: "#A3A3A3" }}
            >
              {tpl(copy.heroCtaSecondary, trialDays)}
            </a>
          </div>
        </section>

        {/* Bloque de valor */}
        <section className="max-w-4xl mx-auto px-5 py-10 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {copy.valueCards.map((c, i) => (
            <ValueCard key={i} emoji={c.emoji} title={c.title}>
              {tpl(c.body, trialDays)}
            </ValueCard>
          ))}
        </section>

        {/* Planes */}
        <section id="planes" className="max-w-5xl mx-auto px-5 py-12">
          <h2
            className="font-bold text-center mb-3"
            style={{
              fontSize: "clamp(32px, 5vw, 44px)",
              letterSpacing: "-0.025em",
            }}
          >
            {copy.planesTitle}
          </h2>
          <p
            className="text-center mb-10 max-w-xl mx-auto text-sm sm:text-base"
            style={{ color: "#A3A3A3" }}
          >
            {tpl(copy.planesSubtitle, trialDays)}
          </p>

          <PreventionPlansBlock
            plans={plans}
            trialDays={trialDays}
            bullets={bullets}
            highlightBadgeLabel={copy.highlightBadgeLabel}
            ctaTemplate={copy.ctaPlanTemplate}
            gradient={gradient}
            brandPrimary={copy.brandPrimary}
          />
        </section>

        {/* FAQ */}
        <section id="preguntas" className="max-w-2xl mx-auto px-5 py-14 space-y-3">
          <h2
            className="font-bold text-center mb-8"
            style={{
              fontSize: "clamp(28px, 4vw, 36px)",
              letterSpacing: "-0.02em",
            }}
          >
            {copy.faqTitle}
          </h2>
          {copy.faqItems.map((f, i) => (
            <FaqItem key={i} q={tpl(f.q, trialDays)}>
              {tpl(f.a, trialDays)}
            </FaqItem>
          ))}
        </section>

        {/* Footer */}
        <footer
          className="max-w-4xl mx-auto px-5 py-10 text-center text-xs border-t"
          style={{ color: "#525252", borderColor: "#262626" }}
        >
          <div className="mb-1">{tpl(copy.footerCopyright, trialDays)}</div>
          <div className="flex items-center justify-center gap-3">
            <a href="/privacidad" className="hover:text-neutral-300 hover:underline">Privacidad</a>
            <span>·</span>
            <a href="/terminos" className="hover:text-neutral-300 hover:underline">Términos</a>
          </div>
        </footer>
      </div>
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
    <div
      className="rounded-2xl p-5 transition-transform hover:-translate-y-0.5"
      style={{
        background: "rgba(20, 20, 20, 0.85)",
        border: "1px solid #262626",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="text-3xl mb-2">{emoji}</div>
      <div
        className="font-semibold text-base mb-1.5"
        style={{ letterSpacing: "-0.01em", color: "#FAFAFA" }}
      >
        {title}
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#A3A3A3" }}>
        {children}
      </p>
    </div>
  );
}

function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details
      className="group rounded-xl"
      style={{
        background: "rgba(20, 20, 20, 0.85)",
        border: "1px solid #262626",
        backdropFilter: "blur(8px)",
      }}
    >
      <summary className="cursor-pointer list-none flex items-center justify-between p-4 gap-2">
        <span className="text-sm font-semibold" style={{ color: "#FAFAFA" }}>{q}</span>
        <span
          className="text-lg leading-none transition-transform group-open:rotate-45"
          style={{ color: "#525252" }}
          aria-hidden
        >
          +
        </span>
      </summary>
      <div
        className="px-4 pb-4 text-sm leading-relaxed whitespace-pre-line"
        style={{ color: "#A3A3A3" }}
      >
        {children}
      </div>
    </details>
  );
}
