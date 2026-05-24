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

// ============================================================================
// Landing de CONTRATAR (post-venta). Copy general + por programa.
// ============================================================================

export type ContractProgramCopy = { title: string; subtitle: string; bullets: string[] };
export type ContractLandingCopy = {
  headline: string;
  subheadline: string;
  footer: string;
  programs: { RECUPERA: ContractProgramCopy; CONSOLIDA: ContractProgramCopy };
};

export const CONTRACT_LANDING_DEFAULTS: ContractLandingCopy = {
  headline: "Aquí tienes tu programa",
  subheadline: "El precio y la duración son los que acordamos en la videollamada.",
  footer: "¿Algo no encaja con lo que hablamos? Escríbenos al WhatsApp antes de pagar.",
  programs: {
    RECUPERA: {
      title: "Programa RECUPERA",
      subtitle: "Recupera tu rendimiento sin dolor",
      bullets: [
        "Plan de recuperación 100% personalizado a tu lesión",
        "Tu propio fisio asignado, en seguimiento semanal",
        "Acceso a la app FisioFit y a tu biblioteca de ejercicios",
        "Chat directo con tu fisio para resolver dudas",
        "Adaptación a tu deporte (CrossFit, Hyrox, running...)",
      ],
    },
    CONSOLIDA: {
      title: "Programa CONSOLIDA",
      subtitle: "Vuelve más fuerte y evita recaer",
      bullets: [
        "Plan de mantenimiento y prevención específico para ti",
        "Tu propio fisio asignado, en seguimiento mensual",
        "Biblioteca completa: ejercicios de recuperación + consolidación",
        "Chat directo con tu fisio",
        "Sesiones de revisión periódicas para evitar recaer",
      ],
    },
  },
};

function normalizeProgram(raw: any, def: ContractProgramCopy): ContractProgramCopy {
  const o = raw && typeof raw === "object" ? raw : {};
  const str = (v: unknown, fb: string) => (typeof v === "string" && v.trim() ? v : fb);
  const bullets = Array.isArray(o.bullets)
    ? o.bullets.map((b: unknown) => String(b)).filter((b: string) => b.trim() !== "")
    : def.bullets;
  return {
    title: str(o.title, def.title),
    subtitle: str(o.subtitle, def.subtitle),
    bullets: bullets.length ? bullets : def.bullets,
  };
}

export function normalizeContractCopy(raw: unknown): ContractLandingCopy {
  const d = CONTRACT_LANDING_DEFAULTS;
  const o = (raw && typeof raw === "object" ? raw : {}) as any;
  const str = (v: unknown, fb: string) => (typeof v === "string" && v.trim() ? v : fb);
  return {
    headline: str(o.headline, d.headline),
    subheadline: str(o.subheadline, d.subheadline),
    footer: str(o.footer, d.footer),
    programs: {
      RECUPERA: normalizeProgram(o.programs?.RECUPERA, d.programs.RECUPERA),
      CONSOLIDA: normalizeProgram(o.programs?.CONSOLIDA, d.programs.CONSOLIDA),
    },
  };
}

// ============================================================================
// Landing de AGENDA (reserva videoconsulta). Hero + autoridad + credenciales.
// ============================================================================

export type AgendaStat = { value: string; label: string };
export type AgendaLandingCopy = {
  heroTitle1: string;
  heroTitle2: string; // segunda línea (degradado)
  heroSubtitle: string;
  authorityTitle: string;
  authorityText: string;
  stats: AgendaStat[]; // exactamente 3
};

export const AGENDA_LANDING_DEFAULTS: AgendaLandingCopy = {
  heroTitle1: "Vuelve a entrenar",
  heroTitle2: "sin dolor.",
  heroSubtitle:
    "Reserva una videoconsulta gratuita de valoración con el equipo FisioFit Team. Te ayudamos a entender qué le pasa a tu cuerpo y diseñamos el plan para que vuelvas al box cuanto antes.",
  authorityTitle: "Un equipo de fisios especializado en CrossFit",
  authorityText:
    "Llevamos +10 años en boxes, entrenando y tratando a atletas como tú. No somos fisios genéricos: entendemos las exigencias del CrossFit porque las hemos vivido en primera persona.",
  stats: [
    { value: "+600", label: "atletas recuperados" },
    { value: "+10", label: "años en boxes" },
    { value: "✓", label: "Fisios colegiados" },
  ],
};

export function normalizeAgendaCopy(raw: unknown): AgendaLandingCopy {
  const d = AGENDA_LANDING_DEFAULTS;
  const o = (raw && typeof raw === "object" ? raw : {}) as any;
  const str = (v: unknown, fb: string) => (typeof v === "string" && v.trim() ? v : fb);
  const rawStats = Array.isArray(o.stats) ? o.stats : [];
  const stats: AgendaStat[] = [0, 1, 2].map((i) => ({
    value: str(rawStats[i]?.value, d.stats[i].value),
    label: str(rawStats[i]?.label, d.stats[i].label),
  }));
  return {
    heroTitle1: str(o.heroTitle1, d.heroTitle1),
    heroTitle2: str(o.heroTitle2, d.heroTitle2),
    heroSubtitle: str(o.heroSubtitle, d.heroSubtitle),
    authorityTitle: str(o.authorityTitle, d.authorityTitle),
    authorityText: str(o.authorityText, d.authorityText),
    stats,
  };
}
