/**
 * Parseo lenient del texto que el user pega cuando añade un carrusel a la
 * biblioteca. El formato "oficial" que le sugerimos en la UI es:
 *
 *   Slide 1
 *   Titular: NO NECESITAS ACTIVAR MÁS EL HOMBRO
 *   Subtítulo: Necesitas prepararlo para carga real
 *   Cuerpo: ...texto libre...
 *
 *   Slide 2
 *   ...
 *
 *   CAPTION:
 *   ...pie del post en Instagram...
 *
 * Pero acepta variantes: "🟪 Slide 3 – Gancho", "👉 Slide 4 – ..." o simple
 * "Slide 5". Y si no aparecen las etiquetas "Titular:" / "Subtítulo:" /
 * "Cuerpo:" el cuerpo entero cae en `body` y el user lo ordena luego en
 * la UI.
 */
import type { CarouselSlide } from "./types";

const SLIDE_HEADER = /^\s*(?:[\p{Extended_Pictographic}\p{Emoji}👉➡️—–\-•\s]*)Slide\s+(\d+)[^\n]*$/gimu;
const CAPTION_HEADER = /^\s*(?:CAPTION|Caption|Pie del post|Pie|Post)\s*:?\s*$/gm;

const FIELD_ALIASES = {
  title: [
    "titular",
    "título",
    "titulo",
    "texto grande",
    "texto principal",
    "hook",
    "gancho",
  ],
  subtitle: [
    "subtítulo",
    "subtitulo",
    "texto pequeño",
    "texto pequeno",
    "bajada",
  ],
  body: [
    "cuerpo",
    "texto",
    "desarrollo",
    "contenido",
    "descripción",
    "descripcion",
  ],
  note: [
    "visual sugerida",
    "visual",
    "nota",
    "imagen",
    "foto",
  ],
} as const;

function stripQuotes(s: string): string {
  return s.trim().replace(/^["'“”«»]+|["'“”«»]+$/g, "").trim();
}

/**
 * Extrae los campos titular/subtitle/body/note de un bloque de texto de un
 * slide. Si detecta líneas del tipo "Titular: XXX" las asigna al campo
 * correspondiente; el resto lo apila en `body`.
 */
function parseSlideBody(raw: string): Omit<CarouselSlide, "n"> {
  const lines = raw.split(/\r?\n/);
  const out: { title?: string; subtitle?: string; body?: string; note?: string } = {};
  const bodyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      bodyLines.push("");
      continue;
    }
    // Buscamos "Etiqueta: valor"
    const colon = trimmed.indexOf(":");
    if (colon > 0 && colon < 40) {
      const label = trimmed.slice(0, colon).toLowerCase().trim();
      const value = trimmed.slice(colon + 1).trim();
      const matched = (Object.entries(FIELD_ALIASES) as Array<[keyof typeof FIELD_ALIASES, readonly string[]]>)
        .find(([, aliases]) => aliases.includes(label));
      if (matched && value) {
        const [key] = matched;
        // Concatenamos si ya había: podría haber 2 líneas "Titular:".
        out[key] = out[key] ? `${out[key]}\n${stripQuotes(value)}` : stripQuotes(value);
        continue;
      }
    }
    bodyLines.push(line);
  }

  const bodyJoined = bodyLines.join("\n").trim();
  if (bodyJoined) {
    out.body = out.body ? `${out.body}\n${bodyJoined}` : bodyJoined;
  }
  return out;
}

export type ParsedCarousel = {
  slides: CarouselSlide[];
  caption: string | null;
};

/**
 * Parsea un texto pegado por el user. Divide por "Slide N", opcionalmente
 * detecta caption al final. Es intencionadamente permisivo: si el user
 * pega el carrusel completo tal y como lo escribió en Notas / Notion,
 * el parser hace lo posible por descomponerlo.
 */
export function parseCarouselText(raw: string): ParsedCarousel {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return { slides: [], caption: null };

  // Extraemos caption primero (si existe): todo tras "CAPTION:" al final.
  let caption: string | null = null;
  const captionMatches = [...text.matchAll(CAPTION_HEADER)];
  let carouselBody = text;
  if (captionMatches.length > 0) {
    const last = captionMatches[captionMatches.length - 1];
    const idx = last.index ?? -1;
    if (idx >= 0) {
      const before = text.slice(0, idx).trimEnd();
      const after = text.slice(idx + last[0].length).trimStart();
      caption = after || null;
      carouselBody = before;
    }
  }

  // Localizamos las cabeceras Slide N y troceamos.
  const headerHits: Array<{ n: number; start: number; end: number }> = [];
  const matches = [...carouselBody.matchAll(SLIDE_HEADER)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const n = Number(m[1]);
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? carouselBody.length : carouselBody.length;
    headerHits.push({ n, start, end });
  }

  const slides: CarouselSlide[] = headerHits.map(({ n, start, end }) => {
    const rawBody = carouselBody.slice(start, end).trim();
    return { n, ...parseSlideBody(rawBody) };
  });

  return { slides, caption };
}

/**
 * Serializa un array de slides + caption al formato de texto plano — útil
 * cuando queremos mostrar en la UI un "modo texto" para editar rápido.
 */
export function serializeCarouselText(slides: CarouselSlide[], caption: string | null): string {
  const parts = slides.map((s) => {
    const header = `Slide ${s.n}`;
    const lines: string[] = [header];
    if (s.title) lines.push(`Titular: ${s.title}`);
    if (s.subtitle) lines.push(`Subtítulo: ${s.subtitle}`);
    if (s.body) lines.push(`Cuerpo: ${s.body}`);
    if (s.note) lines.push(`Visual sugerida: ${s.note}`);
    return lines.join("\n");
  });
  if (caption) parts.push(`CAPTION:\n${caption}`);
  return parts.join("\n\n");
}
