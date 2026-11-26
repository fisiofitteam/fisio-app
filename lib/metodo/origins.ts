/**
 * Ad/Reel landings: `/metodo?origen=hombro`. Only the hero copy changes, and the WhatsApp
 * message gains one line naming the zone so the team knows where the athlete comes from.
 * Pure module: shared by the page, the landing and the contact redirect. No PII.
 */
type OriginCopy = { eyebrow: string; title: string; body: string; message: string };

export const ORIGINS: Record<string, OriginCopy> = {
  hombro: { eyebrow: "FISIOTERAPIA PARA ATLETAS CON DOLOR DE HOMBRO", title: "Que el hombro no decida cómo entrenas.", body: "Press, kipping, snatch… Si llevas tiempo adaptando todo lo que pasa por encima de la cabeza, valoramos tu caso y construimos contigo el camino de vuelta.", message: "Me molesta el hombro." },
  rodilla: { eyebrow: "FISIOTERAPIA PARA ATLETAS CON DOLOR DE RODILLA", title: "Que la rodilla no decida cómo entrenas.", body: "Sentadillas, saltos, lunges… Si llevas tiempo esquivando lo que carga la rodilla, valoramos tu caso y construimos contigo el camino de vuelta.", message: "Me molesta la rodilla." },
  lumbar: { eyebrow: "FISIOTERAPIA PARA ATLETAS CON DOLOR LUMBAR", title: "Que la espalda no decida cómo entrenas.", body: "Peso muerto, cleans, remo… Si la zona lumbar te obliga a bajar cargas o saltarte movimientos, valoramos tu caso y construimos contigo el camino de vuelta.", message: "Me molesta la zona lumbar." },
  codo: { eyebrow: "FISIOTERAPIA PARA ATLETAS CON DOLOR DE CODO O MUÑECA", title: "Que el codo no decida cómo entrenas.", body: "Pull-ups, toes to bar, front rack… Si el agarre o el apoyo te duelen cada semana, valoramos tu caso y construimos contigo el camino de vuelta.", message: "Me molesta el codo o la muñeca." },
  cadera: { eyebrow: "FISIOTERAPIA PARA ATLETAS CON DOLOR DE CADERA", title: "Que la cadera no decida cómo entrenas.", body: "Sentadilla profunda, carrera, wall balls… Si la cadera te limita el rango o la carga, valoramos tu caso y construimos contigo el camino de vuelta.", message: "Me molesta la cadera." },
  autotest: { eyebrow: "HAS HECHO EL AUTOTEST DE HOMBRO", title: "Ya conoces mejor tu hombro. Ahora, tu plan.", body: "Escríbenos por WhatsApp y un fisioterapeuta del equipo valorará contigo por dónde empezar.", message: "He hecho el autotest de hombro." },
};
const ALIASES: Record<string, string> = { espalda: "lumbar", "muñeca": "codo", muneca: "codo", autotesthombro: "autotest", "autotest-hombro": "autotest" };

export function resolveOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().slice(0, 40);
  const resolved = ALIASES[key] || key;
  return Object.prototype.hasOwnProperty.call(ORIGINS, resolved) ? resolved : null;
}

/** The athlete can still edit or delete this line before sending. Unknown origins add nothing. */
export function originMessage(message: string, origin: unknown) {
  const key = resolveOrigin(origin);
  if (!key) return message;
  const base = message.trim(), line = ORIGINS[key].message;
  return base ? `${base}\n\n${line}` : line;
}
