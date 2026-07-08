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
export type AgendaBlock = { id: string; title: string; text: string; imageUrl: string };
export type AgendaLandingCopy = {
  heroTitle1: string;
  heroTitle2: string; // segunda línea (degradado)
  heroSubtitle: string;
  authorityTitle: string;
  authorityText: string;
  groupImageUrl: string; // foto de grupo del equipo (prueba social); "" = placeholder
  stats: AgendaStat[]; // exactamente 3
  blocks: AgendaBlock[]; // bloques libres (casos de éxito, etc.)
};

export const AGENDA_LANDING_DEFAULTS: AgendaLandingCopy = {
  heroTitle1: "Vuelve a entrenar",
  heroTitle2: "sin dolor.",
  heroSubtitle:
    "Reserva una videoconsulta gratuita de valoración con el equipo FisioFit Team. Te ayudamos a entender qué le pasa a tu cuerpo y diseñamos el plan para que vuelvas al box cuanto antes.",
  authorityTitle: "Un equipo de fisios especializado en CrossFit",
  authorityText:
    "Llevamos +10 años en boxes, entrenando y tratando a atletas como tú. No somos fisios genéricos: entendemos las exigencias del CrossFit porque las hemos vivido en primera persona.",
  groupImageUrl: "",
  stats: [
    { value: "+600", label: "atletas recuperados" },
    { value: "+10", label: "años en boxes" },
    { value: "✓", label: "Fisios colegiados" },
  ],
  blocks: [],
};

// ============================================================================
// Landing de CONFIRMACIÓN de reserva (agenda/gracias).
// ============================================================================

export type AgendaGraciasCopy = {
  heroTitleWithName: string; // usa {nombre}
  heroTitleNoName: string;
  reservedWithDate: string; // usa {fecha}
  reservedNoDate: string;
  callTitle: string;
  callText: string;
  videoBadge: string;
  videoTitle: string;
  videoIntro: string;
  videoId: string; // ID de YouTube
  videoBullets: string[];
  prepTitle: string;
  prepText: string;
  stepsTitle: string;
  steps: string[];
  policyTitle: string;
  policyText: string;
  policyWarning: string;
  contactText: string;
  whatsappNumber: string;
  instagramHandle: string;
};

export const AGENDA_GRACIAS_DEFAULTS: AgendaGraciasCopy = {
  heroTitleWithName: "Listo, {nombre}.",
  heroTitleNoName: "Reserva confirmada",
  reservedWithDate: "Tu videoconsulta está reservada para el {fecha}.",
  reservedNoDate: "Tu videoconsulta está reservada.",
  callTitle: "Cómo será tu videoconsulta",
  callText:
    "Será una llamada de 45-60 minutos. Un especialista de FisioFit te atenderá.\n\nHablaremos para conocer tu problema a fondo y saber qué errores te mantienen en el bucle. Luego te daremos claridad sobre cómo puedes volver a disfrutar de CrossFit sin dolor.",
  videoBadge: "IMPORTANTE",
  videoTitle: "Mira esto antes de la llamada",
  videoIntro:
    "Hemos preparado un vídeo corto para que llegues a la videoconsulta con todo el contexto. Es la mejor forma de aprovechar al máximo nuestra sesión:",
  videoId: "DnEAQXs09BI",
  videoBullets: [
    "Conocerás cómo trabajamos y nuestra metodología",
    "Llegarás con las preguntas correctas",
    "Aprovecharás cada minuto de la videoconsulta",
  ],
  prepTitle: "Cómo prepararte",
  prepText:
    "Busca un sitio tranquilo, sin distracciones. Evita conectarte por la calle o conduciendo: necesitamos toda tu atención para sacar el máximo partido de la llamada.",
  stepsTitle: "Qué pasará antes de la llamada",
  steps: [
    "En breve recibirás un mensaje por WhatsApp para presentarte al especialista que te atenderá y resolver cualquier duda inicial.",
    "24 horas antes de la llamada te enviaremos un recordatorio con el link de Google Meet para conectarte.",
    "Hablamos a la hora que has reservado. Solo tienes que entrar en el link que te enviaremos por WhatsApp.",
  ],
  policyTitle: "Política de cancelación",
  policyText:
    "Atendemos a un número muy limitado de personas cada semana. Si reservas, comprométete con tu cita.\n\nSi necesitas cancelar o reprogramar, avísanos con la mayor antelación posible. Liberamos tu hueco para otra persona que también lo está esperando.",
  policyWarning:
    "⚠️ Importante: si no acudes sin avisar, no podrás volver a agendar con nosotros. Nuestro tiempo es limitado y solo trabajamos con personas verdaderamente comprometidas con su recuperación.",
  contactText: "¿Te ha surgido un imprevisto o tienes dudas antes de la llamada?",
  whatsappNumber: "+34621495367",
  instagramHandle: "fisiofitcross",
};

export function normalizeAgendaGraciasCopy(raw: unknown): AgendaGraciasCopy {
  const d = AGENDA_GRACIAS_DEFAULTS;
  const o = (raw && typeof raw === "object" ? raw : {}) as any;
  const str = (v: unknown, fb: string) => (typeof v === "string" && v.trim() ? v : fb);
  const list = (v: unknown, fb: string[]) => {
    if (!Array.isArray(v)) return fb;
    const arr = v.map((x) => String(x)).filter((x) => x.trim() !== "");
    return arr.length ? arr : fb;
  };
  return {
    heroTitleWithName: str(o.heroTitleWithName, d.heroTitleWithName),
    heroTitleNoName: str(o.heroTitleNoName, d.heroTitleNoName),
    reservedWithDate: str(o.reservedWithDate, d.reservedWithDate),
    reservedNoDate: str(o.reservedNoDate, d.reservedNoDate),
    callTitle: str(o.callTitle, d.callTitle),
    callText: str(o.callText, d.callText),
    videoBadge: str(o.videoBadge, d.videoBadge),
    videoTitle: str(o.videoTitle, d.videoTitle),
    videoIntro: str(o.videoIntro, d.videoIntro),
    videoId: str(o.videoId, d.videoId),
    videoBullets: list(o.videoBullets, d.videoBullets),
    prepTitle: str(o.prepTitle, d.prepTitle),
    prepText: str(o.prepText, d.prepText),
    stepsTitle: str(o.stepsTitle, d.stepsTitle),
    steps: list(o.steps, d.steps),
    policyTitle: str(o.policyTitle, d.policyTitle),
    policyText: str(o.policyText, d.policyText),
    policyWarning: str(o.policyWarning, d.policyWarning),
    contactText: str(o.contactText, d.contactText),
    whatsappNumber: str(o.whatsappNumber, d.whatsappNumber),
    instagramHandle: str(o.instagramHandle, d.instagramHandle),
  };
}

export function normalizeAgendaCopy(raw: unknown): AgendaLandingCopy {
  const d = AGENDA_LANDING_DEFAULTS;
  const o = (raw && typeof raw === "object" ? raw : {}) as any;
  const str = (v: unknown, fb: string) => (typeof v === "string" && v.trim() ? v : fb);
  const optStr = (v: unknown) => (typeof v === "string" ? v : "");
  const rawStats = Array.isArray(o.stats) ? o.stats : [];
  const stats: AgendaStat[] = [0, 1, 2].map((i) => ({
    value: str(rawStats[i]?.value, d.stats[i].value),
    label: str(rawStats[i]?.label, d.stats[i].label),
  }));
  const rawBlocks = Array.isArray(o.blocks) ? o.blocks : [];
  const blocks: AgendaBlock[] = [];
  rawBlocks.forEach((b: any, i: number) => {
    if (!b || typeof b !== "object") return;
    const title = optStr(b.title);
    const text = optStr(b.text);
    const imageUrl = optStr(b.imageUrl);
    if (!title.trim() && !text.trim() && !imageUrl.trim()) return; // bloque vacío
    blocks.push({ id: typeof b.id === "string" && b.id ? b.id : `b_${i}`, title, text, imageUrl });
  });
  return {
    heroTitle1: str(o.heroTitle1, d.heroTitle1),
    heroTitle2: str(o.heroTitle2, d.heroTitle2),
    heroSubtitle: str(o.heroSubtitle, d.heroSubtitle),
    authorityTitle: str(o.authorityTitle, d.authorityTitle),
    authorityText: str(o.authorityText, d.authorityText),
    groupImageUrl: optStr(o.groupImageUrl),
    stats,
    blocks,
  };
}

// ============================================================================
// Landing de PREVENTION (público, prevention.fisiofitteam.com)
// ============================================================================
//
// Placeholders disponibles en cualquier campo:
//   {trialDays}  → nº de días de prueba (4 por defecto)
//   {year}       → año actual
// Los 3 precios y bullets por plan se generan desde PREVENTION_PLAN_CONFIG,
// no se editan aquí (para no divergir con Stripe).

export type PreventionValueCard = { emoji: string; title: string; body: string };
export type PreventionFaqItem = { q: string; a: string };

export type PreventionLandingCopy = {
  // Colores del brand (permite cambiar el look completo sin tocar código)
  brandPrimary: string;      // "#10B981"
  brandPrimaryDark: string;  // "#059669"
  brandAccentSoft: string;   // "#ECFDF5" — fondos suaves de badge

  // Header
  brandName: string;
  brandSuffix: string;
  headerCtaLabel: string;

  // Hero
  heroBadge: string;
  heroTitle: string;
  heroSubtitle: string;
  heroTrialLine: string;
  heroCtaPrimary: string;
  heroCtaSecondary: string;

  // Bloque de valor (3-4 cards)
  valueCards: PreventionValueCard[];

  // Planes
  planesTitle: string;
  planesSubtitle: string;
  planBullets: string[];
  highlightBadgeLabel: string;
  ctaPlanTemplate: string;   // ej. "Empezar {plan}"

  // FAQ
  faqTitle: string;
  faqItems: PreventionFaqItem[];

  // Footer
  footerCopyright: string;
};

export const PREVENTION_LANDING_DEFAULTS: PreventionLandingCopy = {
  brandPrimary: "#10B981",
  brandPrimaryDark: "#059669",
  brandAccentSoft: "#ECFDF5",

  brandName: "FisioFit",
  brandSuffix: "Prevention",
  headerCtaLabel: "Ver planes →",

  heroBadge: "Servicio recurrente · desde 17 €/mes",
  heroTitle: "Cuídate en 15 minutos al día.",
  heroSubtitle:
    "Rolling semanal de movilidad, técnica y activación diseñado para atletas de CrossFit y Hyrox que ya están sanos y quieren mantenerse ahí. Sin pasos, sin excusas, sin sobre-entrenar.",
  heroTrialLine: "{trialDays} días gratis. Cancela cuando quieras.",
  heroCtaPrimary: "Empezar ahora →",
  heroCtaSecondary: "¿Cómo funciona?",

  valueCards: [
    { emoji: "🧘", title: "15 min al día", body: "Micro-sesiones diarias de lunes a viernes. Se integran en tu warm-up o cool-down. No pierdes tiempo." },
    { emoji: "🎥", title: "Vídeos de referencia", body: "Cada ejercicio con su vídeo de técnica. Nunca dudas cómo se hace." },
    { emoji: "🔄", title: "Se actualiza cada semana", body: "Programación viva. No es un curso estático — evoluciona contigo." },
  ],

  planesTitle: "Elige tu plan",
  planesSubtitle:
    "Puedes cancelar cuando quieras. Los primeros {trialDays} días son gratis y no cobramos si cancelas antes.",
  planBullets: [
    "Contenido semanal renovado",
    "Vídeos de cada ejercicio",
    "Comunidad + reto del mes",
    "{trialDays} días gratis",
    "Cancela cuando quieras",
  ],
  highlightBadgeLabel: "Más elegido",
  ctaPlanTemplate: "Empezar {plan}",

  faqTitle: "Preguntas frecuentes",
  faqItems: [
    {
      q: "¿Cómo funcionan los {trialDays} días gratis?",
      a: "Introduces tu método de pago pero no se cobra nada durante los primeros {trialDays} días. Puedes cancelar en cualquier momento antes de que termine la prueba y no se hará ningún cargo.",
    },
    {
      q: "¿Puedo cancelar cuando quiera?",
      a: "Sí. Desde tu panel puedes cancelar la renovación con un click. Mantienes el acceso hasta el final del periodo ya pagado.",
    },
    {
      q: "¿Qué diferencia hay con RECUPERA o CONSOLIDA?",
      a: "Prevention es un servicio recurrente low-ticket para gente ya sana que quiere mantenerse. No hay fisio asignado ni seguimiento personalizado — es contenido rolling con vídeos. Si tienes una lesión o quieres acompañamiento 1:1, cuéntanoslo y te derivamos al programa RECUPERA o CONSOLIDA.",
    },
    {
      q: "¿Puedo consultar con un fisio si me surge algo?",
      a: "Sí. Desde la app puedes reservar una consulta de 45 min por 17 € cuando lo necesites. Sin compromiso de continuidad.",
    },
    {
      q: "¿Se renueva automáticamente?",
      a: "Sí, para que no te quedes sin acceso por olvido. Te avisamos con 7 días de antelación por email y siempre puedes desactivar la renovación desde tu panel.",
    },
  ],

  footerCopyright: "© {year} FisioFit Team · fisiofitteam.com",
};

export function normalizePreventionCopy(raw: unknown): PreventionLandingCopy {
  const d = PREVENTION_LANDING_DEFAULTS;
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, fallback: string) =>
    typeof v === "string" && v.trim() ? v : fallback;
  const hex = (v: unknown, fallback: string) =>
    typeof v === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(v.trim()) ? v.trim() : fallback;

  const valueCards: PreventionValueCard[] = Array.isArray(o.valueCards)
    ? (o.valueCards as unknown[])
        .map((c) => {
          const cc = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
          return {
            emoji: str(cc.emoji, "✨"),
            title: str(cc.title, ""),
            body: str(cc.body, ""),
          };
        })
        .filter((c) => c.title.trim() !== "" || c.body.trim() !== "")
    : d.valueCards;

  const planBullets: string[] = Array.isArray(o.planBullets)
    ? (o.planBullets as unknown[]).map((b) => String(b)).filter((b) => b.trim() !== "")
    : d.planBullets;

  const faqItems: PreventionFaqItem[] = Array.isArray(o.faqItems)
    ? (o.faqItems as unknown[])
        .map((f) => {
          const ff = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
          return { q: str(ff.q, ""), a: str(ff.a, "") };
        })
        .filter((f) => f.q.trim() !== "" && f.a.trim() !== "")
    : d.faqItems;

  return {
    brandPrimary: hex(o.brandPrimary, d.brandPrimary),
    brandPrimaryDark: hex(o.brandPrimaryDark, d.brandPrimaryDark),
    brandAccentSoft: hex(o.brandAccentSoft, d.brandAccentSoft),

    brandName: str(o.brandName, d.brandName),
    brandSuffix: str(o.brandSuffix, d.brandSuffix),
    headerCtaLabel: str(o.headerCtaLabel, d.headerCtaLabel),

    heroBadge: str(o.heroBadge, d.heroBadge),
    heroTitle: str(o.heroTitle, d.heroTitle),
    heroSubtitle: str(o.heroSubtitle, d.heroSubtitle),
    heroTrialLine: str(o.heroTrialLine, d.heroTrialLine),
    heroCtaPrimary: str(o.heroCtaPrimary, d.heroCtaPrimary),
    heroCtaSecondary: str(o.heroCtaSecondary, d.heroCtaSecondary),

    valueCards: valueCards.length ? valueCards : d.valueCards,

    planesTitle: str(o.planesTitle, d.planesTitle),
    planesSubtitle: str(o.planesSubtitle, d.planesSubtitle),
    planBullets: planBullets.length ? planBullets : d.planBullets,
    highlightBadgeLabel: str(o.highlightBadgeLabel, d.highlightBadgeLabel),
    ctaPlanTemplate: str(o.ctaPlanTemplate, d.ctaPlanTemplate),

    faqTitle: str(o.faqTitle, d.faqTitle),
    faqItems: faqItems.length ? faqItems : d.faqItems,

    footerCopyright: str(o.footerCopyright, d.footerCopyright),
  };
}
