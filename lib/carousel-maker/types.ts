/**
 * Types compartidos del Carrusel Maker (biblioteca + drafts + generación IA).
 * Ver `lib/carousel-maker/parse.ts` para las utilidades de parseo de texto
 * pegado por el user en el formato del brief.
 */

/**
 * Categorías canónicas de carruseles del equipo — usadas tanto en la
 * biblioteca como en los drafts. Añadir aquí cualquier nueva estructura
 * narrativa que empecemos a repetir.
 */
export const CAROUSEL_CATEGORIES = [
  { value: "errores", label: "Errores enumerados" },
  { value: "caso_clinico", label: "Caso clínico (antes / puente / después)" },
  { value: "educativo", label: "Educativo con marco mental" },
  { value: "mito", label: "Mito vs realidad" },
  { value: "frustracion", label: "Frustración común" },
  { value: "anatomico", label: "Educativo anatómico" },
  { value: "otro", label: "Otro" },
] as const;

export type CarouselCategory = (typeof CAROUSEL_CATEGORIES)[number]["value"];

/**
 * Un slide: siempre lleva `n` (orden 1-based) y al menos uno de los campos
 * de contenido rellenos. `title` es el titular gigante que ocupa la mayoría
 * del canvas; `subtitle` es la línea inmediatamente debajo, más pequeña;
 * `body` es el desarrollo (párrafos, viñetas — lo dejamos como texto libre
 * y la IA/UI decide cómo formatear). `note` guarda pistas del user o de la
 * IA sobre el visual sugerido (foto, iconos, etc).
 */
export type CarouselSlide = {
  n: number;
  title?: string;
  subtitle?: string;
  body?: string;
  note?: string;
};

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return "Sin categoría";
  const found = CAROUSEL_CATEGORIES.find((c) => c.value === value);
  return found?.label ?? value;
}

export function parseSlides(raw: string | null | undefined): CarouselSlide[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((s: any, i: number): CarouselSlide => ({
        n: typeof s?.n === "number" ? s.n : i + 1,
        title: typeof s?.title === "string" ? s.title : undefined,
        subtitle: typeof s?.subtitle === "string" ? s.subtitle : undefined,
        body: typeof s?.body === "string" ? s.body : undefined,
        note: typeof s?.note === "string" ? s.note : undefined,
      }))
      .sort((a, b) => a.n - b.n);
  } catch {
    return [];
  }
}
