/**
 * Valoración form and ad-origin copy for /metodo. Pure module: shared by the public
 * form (step validation) and the API (authoritative validation). No PII leaves it.
 */
export const REQUEST_CONSENT_VERSION = "metodo-solicitud-2026-11-26-v1";

type OriginCopy = { zone: RequestZone; eyebrow: string; title: string; body: string };
export const REQUEST_ZONES = ["Hombro", "Rodilla", "Lumbar", "Codo / muñeca", "Cadera", "Otra zona"] as const;
export type RequestZone = typeof REQUEST_ZONES[number];
export const REQUEST_DURATIONS = ["Menos de 1 mes", "De 1 a 3 meses", "De 3 a 6 meses", "De 6 a 12 meses", "Más de 1 año"] as const;
export const REQUEST_IMPACTS = ["Entreno con molestias", "Evito algunos movimientos", "He tenido que parar"] as const;
export const REQUEST_SPORTS = ["CrossFit / crosstraining", "Hyrox", "Otro deporte"] as const;
export const REQUEST_TRIED = ["Fisioterapia presencial", "Reposo", "Médico o infiltraciones", "Readaptación con entrenador", "Nada todavía"] as const;
export const NOTHING_TRIED = "Nada todavía";
export const PHONE_PREFIXES = [
  { code: "34", label: "España" }, { code: "351", label: "Portugal" }, { code: "376", label: "Andorra" },
  { code: "33", label: "Francia" }, { code: "39", label: "Italia" }, { code: "44", label: "Reino Unido" },
  { code: "49", label: "Alemania" }, { code: "41", label: "Suiza" }, { code: "52", label: "México" },
  { code: "54", label: "Argentina" }, { code: "56", label: "Chile" }, { code: "57", label: "Colombia" },
  { code: "1", label: "EE. UU. / Canadá" },
] as const;

/**
 * Ad/Reel landings: `/metodo?origen=hombro`. Only the hero copy and the pre-selected
 * zone change; the rest of the page, canonical URL and measurement stay the same.
 */
export const ORIGINS: Record<string, OriginCopy> = {
  hombro: { zone: "Hombro", eyebrow: "FISIOTERAPIA PARA ATLETAS CON DOLOR DE HOMBRO", title: "Que el hombro no decida cómo entrenas.", body: "Press, kipping, snatch… Si llevas tiempo adaptando todo lo que pasa por encima de la cabeza, valoramos tu caso y construimos contigo el camino de vuelta." },
  rodilla: { zone: "Rodilla", eyebrow: "FISIOTERAPIA PARA ATLETAS CON DOLOR DE RODILLA", title: "Que la rodilla no decida cómo entrenas.", body: "Sentadillas, saltos, lunges… Si llevas tiempo esquivando lo que carga la rodilla, valoramos tu caso y construimos contigo el camino de vuelta." },
  lumbar: { zone: "Lumbar", eyebrow: "FISIOTERAPIA PARA ATLETAS CON DOLOR LUMBAR", title: "Que la espalda no decida cómo entrenas.", body: "Peso muerto, cleans, remo… Si la zona lumbar te obliga a bajar cargas o saltarte movimientos, valoramos tu caso y construimos contigo el camino de vuelta." },
  codo: { zone: "Codo / muñeca", eyebrow: "FISIOTERAPIA PARA ATLETAS CON DOLOR DE CODO O MUÑECA", title: "Que el codo no decida cómo entrenas.", body: "Pull-ups, toes to bar, front rack… Si el agarre o el apoyo te duelen cada semana, valoramos tu caso y construimos contigo el camino de vuelta." },
  cadera: { zone: "Cadera", eyebrow: "FISIOTERAPIA PARA ATLETAS CON DOLOR DE CADERA", title: "Que la cadera no decida cómo entrenas.", body: "Sentadilla profunda, carrera, wall balls… Si la cadera te limita el rango o la carga, valoramos tu caso y construimos contigo el camino de vuelta." },
  autotest: { zone: "Hombro", eyebrow: "HAS HECHO EL AUTOTEST DE HOMBRO", title: "Ya conoces mejor tu hombro. Ahora, tu plan.", body: "Cuéntanos tu caso en un minuto. Un fisioterapeuta del equipo lo revisará y valorará contigo por dónde empezar." },
};
const ALIASES: Record<string, string> = { espalda: "lumbar", "muñeca": "codo", muneca: "codo", autotesthombro: "autotest", "autotest-hombro": "autotest" };
export function resolveOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().slice(0, 40);
  const resolved = ALIASES[key] || key;
  return Object.prototype.hasOwnProperty.call(ORIGINS, resolved) ? resolved : null;
}

export type RequestData = {
  zone: RequestZone; duration: string; impact: string; sport: string; tried: string[];
  detail: string; name: string; prefix: string; phone: string; origin: string | null;
};
export type RequestDraft = Partial<Omit<RequestData, "tried">> & { tried?: unknown; consent?: unknown };
type Check = { ok: true; data: RequestData } | { ok: false; step: number; error: string };
const pick = <T extends readonly string[]>(list: T, value: unknown) => typeof value === "string" && (list as readonly string[]).includes(value) ? value as T[number] : null;
const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Steps 1–4 match the public form so the client can point at the step to fix. */
export function validateRequest(input: RequestDraft, upToStep = 4): Check {
  const zone = pick(REQUEST_ZONES, input.zone);
  if (!zone) return { ok: false, step: 1, error: "Elige la zona que te molesta." };
  const duration = pick(REQUEST_DURATIONS, input.duration);
  if (upToStep >= 2 && !duration) return { ok: false, step: 2, error: "Indica cuánto tiempo llevas con dolor." };
  const impact = pick(REQUEST_IMPACTS, input.impact), sport = pick(REQUEST_SPORTS, input.sport);
  const rawTried = Array.isArray(input.tried) ? input.tried : [];
  const tried = REQUEST_TRIED.filter(option => rawTried.includes(option));
  if (upToStep >= 3) {
    if (!impact) return { ok: false, step: 3, error: "Cuéntanos cómo afecta a tu entrenamiento." };
    if (!sport) return { ok: false, step: 3, error: "Indica qué entrenas." };
    if (!tried.length || tried.length !== rawTried.length) return { ok: false, step: 3, error: "Marca lo que has probado (o «Nada todavía»)." };
    if (tried.includes(NOTHING_TRIED) && tried.length > 1) return { ok: false, step: 3, error: "«Nada todavía» no se puede combinar con otras opciones." };
  }
  const name = clean(input.name, 80), detail = clean(input.detail, 500);
  const prefix = PHONE_PREFIXES.some(p => p.code === input.prefix) ? String(input.prefix) : "";
  // A pasted international number ("+34 600…", "0034 600…") is accepted when it repeats the chosen prefix.
  const rawPhone = typeof input.phone === "string" ? input.phone.trim().slice(0, 40) : "";
  const digits = rawPhone.replace(/\D/g, "");
  const international = /^(?:\+|00)/.test(rawPhone) ? digits.replace(/^00/, "") : "";
  const national = international ? (prefix && international.startsWith(prefix) ? international.slice(prefix.length) : "") : digits;
  if (upToStep >= 4) {
    if (name.length < 2) return { ok: false, step: 4, error: "Escribe tu nombre." };
    if (!prefix) return { ok: false, step: 4, error: "Elige el prefijo de tu teléfono." };
    const valid = prefix === "34" ? /^[6789]\d{8}$/.test(national) : /^\d{6,14}$/.test(national) && (prefix + national).length <= 15;
    if (!valid) return { ok: false, step: 4, error: "Revisa tu número de teléfono." };
    if (input.consent !== true) return { ok: false, step: 4, error: "Necesitamos tu consentimiento para tratar la información sobre tu dolor." };
  }
  return { ok: true, data: { zone, duration: duration || "", impact: impact || "", sport: sport || "", tried, detail, name, prefix, phone: prefix + national, origin: resolveOrigin(input.origin) } };
}

/** The athlete sends this text themselves from WhatsApp; nothing is sent on their behalf. */
export function requestMessage(intro: string, data: RequestData) {
  const lines = [
    `• Zona: ${data.zone}`, `• Tiempo con dolor: ${data.duration}`, `• En el entrenamiento: ${data.impact}`,
    `• Entreno: ${data.sport}`, `• He probado: ${data.tried.join(", ")}`, ...(data.detail ? [`• Más detalles: ${data.detail}`] : []),
  ];
  return `${intro.trim() || "Hola, equipo de FisioFitTeam."}\n\nOs cuento mi caso:\n${lines.join("\n")}\n\nSoy ${data.name}.`;
}
