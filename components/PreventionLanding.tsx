"use client";

import type { PreventionLandingCopy } from "@/lib/landing-content";
import { PreventionPlansBlock, type PreventionPlanCardData } from "@/components/PreventionPlansBlock";

// Sustituye {clave} en un texto. Local para evitar la dependencia de
// applyVars() que exige objeto tipado — aquí las variables son fijas.
function tpl(text: string, trialDays: number): string {
  return text
    .replace(/\{trialDays\}/g, String(trialDays))
    .replace(/\{year\}/g, String(new Date().getFullYear()));
}

/**
 * Landing pública de FisioFit Prevention.
 *
 * Dos modos según `copy.mode`:
 *   - "structured": layout de siempre con hero + valueCards + planes + FAQ,
 *     todo con campos editables desde el admin.
 *   - "html": el CEO ha escrito HTML libre (sanitizado en server). Se
 *     inserta el bloque interactivo de planes donde encuentre el
 *     placeholder [[PLANS]], o al final si no lo encuentra.
 *
 * `sanitizedHtml` viene ya limpio del server — sanitize-html corre solo
 * en Node. El cliente confía en él (dangerouslySetInnerHTML).
 */
export function PreventionLanding({
  plans,
  trialDays,
  cancelled,
  copy,
  sanitizedHtml,
}: {
  plans: PreventionPlanCardData[];
  trialDays: number;
  cancelled?: boolean;
  copy: PreventionLandingCopy;
  sanitizedHtml: string;
}) {
  const gradient = `linear-gradient(135deg, ${copy.brandPrimary} 0%, ${copy.brandPrimaryDark} 100%)`;

  const bullets = copy.planBullets.map((b) => tpl(b, trialDays));
  const plansBlock = (
    <PreventionPlansBlock
      plans={plans}
      trialDays={trialDays}
      bullets={bullets}
      highlightBadgeLabel={copy.highlightBadgeLabel}
      ctaTemplate={copy.ctaPlanTemplate}
      gradient={gradient}
      brandPrimary={copy.brandPrimary}
    />
  );

  // ─── Modo HTML libre ──────────────────────────────────────────────────
  if (copy.mode === "html" && sanitizedHtml) {
    const PLACEHOLDER = "[[PLANS]]";
    const idx = sanitizedHtml.indexOf(PLACEHOLDER);
    const before = idx === -1 ? sanitizedHtml : sanitizedHtml.slice(0, idx);
    const after = idx === -1 ? "" : sanitizedHtml.slice(idx + PLACEHOLDER.length);

    return (
      <main className="min-h-screen bg-white text-neutral-900">
        {cancelled && (
          <div className="max-w-3xl mx-auto px-5 pt-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3">
              Has cancelado el proceso. Cuando quieras volver, elige un plan más abajo. Sin compromiso.
            </div>
          </div>
        )}
        <div dangerouslySetInnerHTML={{ __html: before }} />
        <section id="planes" className="max-w-5xl mx-auto px-5 py-10">
          {plansBlock}
        </section>
        {after && <div dangerouslySetInnerHTML={{ __html: after }} />}
        {idx === -1 && (
          // Si no había placeholder, no montamos también el after — el bloque
          // de planes ya se pintó al final del `before`. Nada más que renderizar.
          null
        )}
      </main>
    );
  }

  // ─── Modo estructurado ────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      {/* Cabecera fija minimal */}
      <header className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
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
        <div className="max-w-3xl mx-auto px-5 pt-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3">
            Has cancelado el proceso. Cuando quieras volver, elige un plan aquí abajo. Sin compromiso.
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-5 pt-10 pb-8 text-center">
        <div
          className="inline-flex items-center text-[11px] font-bold tracking-wider px-3 py-1 rounded-full uppercase mb-4"
          style={{
            background: copy.brandAccentSoft,
            color: copy.brandPrimaryDark,
            border: `1px solid ${copy.brandPrimary}40`,
          }}
        >
          {tpl(copy.heroBadge, trialDays)}
        </div>
        <h1
          className="text-4xl sm:text-5xl font-bold leading-tight"
          style={{ letterSpacing: "-0.03em" }}
        >
          {tpl(copy.heroTitle, trialDays)}
        </h1>
        <p className="text-lg text-neutral-600 mt-4 max-w-2xl mx-auto leading-relaxed whitespace-pre-line">
          {tpl(copy.heroSubtitle, trialDays)}
        </p>
        <p className="text-sm text-neutral-500 mt-3">
          {tpl(copy.heroTrialLine, trialDays)}
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <a
            href="#planes"
            className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-3 rounded-xl text-white shadow-sm"
            style={{ background: gradient }}
          >
            {tpl(copy.heroCtaPrimary, trialDays)}
          </a>
          <a href="#preguntas" className="text-sm text-neutral-500 hover:underline">
            {tpl(copy.heroCtaSecondary, trialDays)}
          </a>
        </div>
      </section>

      {/* Bloque de valor */}
      <section className="max-w-4xl mx-auto px-5 py-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {copy.valueCards.map((c, i) => (
          <ValueCard key={i} emoji={c.emoji} title={c.title}>
            {tpl(c.body, trialDays)}
          </ValueCard>
        ))}
      </section>

      {/* Planes */}
      <section id="planes" className="max-w-5xl mx-auto px-5 py-10">
        <h2
          className="text-3xl sm:text-4xl font-bold text-center mb-2"
          style={{ letterSpacing: "-0.02em" }}
        >
          {copy.planesTitle}
        </h2>
        <p className="text-center text-neutral-500 mb-8 max-w-xl mx-auto">
          {tpl(copy.planesSubtitle, trialDays)}
        </p>

        {plansBlock}
      </section>

      {/* FAQ */}
      <section id="preguntas" className="max-w-2xl mx-auto px-5 py-14 space-y-3">
        <h2
          className="text-2xl sm:text-3xl font-bold text-center mb-6"
          style={{ letterSpacing: "-0.02em" }}
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
      <footer className="max-w-4xl mx-auto px-5 py-10 text-center text-xs text-neutral-400 border-t border-neutral-100">
        <div className="mb-1">
          {tpl(copy.footerCopyright, trialDays)}
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
      <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-line">{children}</p>
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
      <div className="px-4 pb-4 text-sm text-neutral-600 leading-relaxed whitespace-pre-line">{children}</div>
    </details>
  );
}
