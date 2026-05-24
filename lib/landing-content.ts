// Copy editable de las landings. Tipos + valores por defecto + sustitución de
// variables. Sin dependencias de servidor (se puede importar en cliente).

export type RenewalLandingCopy = {
  headline: string;
  subheadline: string;
  bullets: string[];
  ctaLabel: string;
  reassurance: string;
};

// Valores por defecto de la landing de renovación. Placeholders disponibles:
// {nombre} {programa} {meses} {importe}
export const RENEWAL_LANDING_DEFAULTS: RenewalLandingCopy = {
  headline: "{nombre}, tu progreso no se detiene aquí",
  subheadline:
    "Renueva tu programa y sigue avanzando con tu fisio, sin perder el ritmo que tanto te ha costado conseguir.",
  bullets: [
    "Tu plan sigue adaptándose a ti, semana a semana",
    "Mantienes el acompañamiento directo de tu fisio",
    "No pierdes la constancia ni el progreso que ya has ganado",
  ],
  ctaLabel: "Renovar mi programa",
  reassurance: "Pago seguro con Stripe · Sigues con el mismo equipo de siempre",
};

// Normaliza/sanea un objeto de copy de renovación (de BD o del editor),
// rellenando con los defaults lo que falte o sea inválido.
export function normalizeRenewalCopy(raw: unknown): RenewalLandingCopy {
  const d = RENEWAL_LANDING_DEFAULTS;
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, fallback: string) =>
    typeof v === "string" && v.trim() ? v : fallback;
  const bullets = Array.isArray(o.bullets)
    ? (o.bullets as unknown[]).map((b) => String(b)).filter((b) => b.trim() !== "")
    : d.bullets;
  return {
    headline: str(o.headline, d.headline),
    subheadline: str(o.subheadline, d.subheadline),
    bullets: bullets.length ? bullets : d.bullets,
    ctaLabel: str(o.ctaLabel, d.ctaLabel),
    reassurance: str(o.reassurance, d.reassurance),
  };
}

// Sustituye {clave} por el valor correspondiente.
export function applyVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}
