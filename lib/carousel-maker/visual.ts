/**
 * Sistema visual del Carrusel Maker · plantilla FisioFit Cross.
 *
 * Basado en la línea gráfica actual de @fisiofitcross en Instagram:
 * fondo negro con textura de grano, header FISIOF/T CROSS, tipografía
 * industrial condensada tipo Anton en los titulares, palabras clave en
 * amarillo dorado, chips con iconos, líneas amarillas cortas de detalle.
 *
 * Todo se referencia en píxeles sobre canvas 1080×1350 (Instagram 4:5).
 * Escalado a display se hace con CSS transform en el editor.
 */

export const CANVAS_W = 1080;
export const CANVAS_H = 1350;

export const PALETTE = {
  bg: "#0A0A0A",
  chalkWhite: "#F5F5EF",
  yellow: "#F4C03D",
  yellowDeep: "#D4A424",
  white: "#FFFFFF",
  muted: "#A3A3A3",
  chipFill: "#0A0A0A",
} as const;

/**
 * Tipografías. Anton la usamos para los titulares gigantes (condensada,
 * industrial); Geist para body/subtítulos (ya cargada en la app); Bebas
 * Neue como alternativa a Anton si Anton no está disponible.
 *
 * FontsLoader carga Anton + Bebas desde Google Fonts al montar el editor.
 */
export const FONTS = {
  display: '"Anton", "Bebas Neue", "Impact", sans-serif',
  body: '"Geist", "Inter", sans-serif',
} as const;

/**
 * Layout: los 5 tipos de slide que sabemos renderizar. La IA solo produce
 * texto en Fase B; el editor visual asigna un layout inicial en base a
 * heurísticas simples y el user lo puede cambiar.
 */
export type SlideLayout =
  | "hook"           // titular gigante ocupando todo el canvas
  | "hook_photo"     // titular a la izquierda + foto/espacio a la derecha
  | "chips_list"    // titular + subtítulo + rejilla 2x2 o 2x3 de chips
  | "text_body"      // titular pequeño arriba + cuerpo largo abajo
  | "cta_ribbon";    // cinta amarilla con la palabra clave del CTA

/**
 * Config por slide dentro del carrusel: layout elegido + overrides que
 * el user puede hacer (chips manuales, foto, palabras clave en amarillo).
 */
export type SlideVisual = {
  layout: SlideLayout;
  /**
   * Palabras del `title` que van en amarillo (case-insensitive).
   * Ej: ["MÁS", "HOMBRO"] → esas palabras aparecen amarillas en el titular.
   */
  yellowWords?: string[];
  /** Chips del layout chips_list. Cada uno: { icon (emoji o inicial), label }. */
  chips?: Array<{ icon: string; label: string }>;
  /** URL o data URL de foto de fondo/derecha. Fase C+ (aún no exponemos upload). */
  photoUrl?: string;
  /** Cinta con la palabra clave del CTA (layout cta_ribbon). */
  ctaKeyword?: string;
};

/**
 * Estado visual completo de un carrusel: por cada slide, su layout+config.
 * Se guarda como JSON en Carousel.visualJson (campo que añadimos con
 * captionText). Si un slide no está aquí, aplicamos autoAssignLayout().
 */
export type CarouselVisual = {
  [slideN: number]: SlideVisual;
};

/**
 * Heurística mínima para asignar layout inicial a cada slide cuando el
 * user abre por primera vez el editor visual. Reglas:
 *  - Último slide y `title` empieza por "Escríbeme" / contiene una palabra
 *    en MAYÚSCULAS gritada como "HOMBRO" → cta_ribbon.
 *  - Primer slide → hook_photo si hay foto o hook si no.
 *  - Slide con body corto y muchos ítems tipo "•" o guiones → chips_list.
 *  - Slide con body largo → text_body.
 *  - Default → hook.
 */
export function autoAssignLayout(slide: { title?: string; body?: string; note?: string }, opts: { isFirst: boolean; isLast: boolean }): SlideLayout {
  const title = slide.title ?? "";
  const body = slide.body ?? "";
  const upperGrito = /\b[A-ZÁÉÍÓÚÑ]{4,}\b/.test(title);

  if (opts.isLast) {
    if (/^escr[íi]beme/i.test(title.trim()) || upperGrito) return "cta_ribbon";
  }
  if (opts.isFirst) {
    return "hook";
  }
  const bullets = (body.match(/^\s*(?:[•\-–—✔️✅🔹🟡🟠🟢]|👉|\d+\.)/gm) ?? []).length;
  if (bullets >= 4 && body.length < 300) return "chips_list";
  if (body.length > 250) return "text_body";
  return "hook";
}

/**
 * Extrae candidatos a "palabra en amarillo" del title: palabras totalmente
 * en mayúsculas de ≥3 caracteres. Se pueden editar en la UI.
 */
export function suggestYellowWords(title: string): string[] {
  const matches = title.match(/\b[A-ZÁÉÍÓÚÑ]{3,}\b/g) ?? [];
  // Dejamos duplicados fuera y limitamos a 3 para no llenar el titular.
  return Array.from(new Set(matches)).slice(0, 3);
}

/**
 * Divide `title` en spans para pintar cada palabra: {word, yellow: bool}.
 * Preserva espacios y saltos de línea.
 */
export function tokenizeTitle(title: string, yellowWords: string[] = []): Array<{ text: string; yellow: boolean; break?: boolean }> {
  const yellowSet = new Set(yellowWords.map((w) => w.toLowerCase()));
  const parts: Array<{ text: string; yellow: boolean; break?: boolean }> = [];
  const lines = title.split(/\n/);
  lines.forEach((line, li) => {
    const tokens = line.split(/(\s+)/);
    for (const t of tokens) {
      if (!t) continue;
      if (/^\s+$/.test(t)) {
        parts.push({ text: t, yellow: false });
      } else {
        const stripped = t.replace(/[.,;:!?¿¡"'"]/g, "").toLowerCase();
        parts.push({ text: t, yellow: yellowSet.has(stripped) });
      }
    }
    if (li < lines.length - 1) parts.push({ text: "", yellow: false, break: true });
  });
  return parts;
}
