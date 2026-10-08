/**
 * Catálogo de tipos de Semáforo soportados por la plataforma.
 *
 * Cada tipo representa una zona corporal con su propio set de preguntas,
 * textos de resultado, vídeos y configuración de WhatsApp. Añadir un
 * tipo nuevo:
 *   1. Añadirlo a `SEMAFORO_TIPOS` abajo (slug canonical + metadatos).
 *   2. Crear `lib/semaforo/questions-<tipo>.ts` con sus preguntas.
 *   3. Añadirlo al switch de `getQuestionsForTipo()` en questions.ts.
 *   4. Crear la ruta pública `/semaforo/<slug>/page.tsx` (o reutilizar
 *      la ruta genérica si existe).
 *   5. El panel admin lo detecta automáticamente desde este catálogo.
 */

export type SemaforoTipo = "hombro" | "lumbar";

export type SemaforoTipoMeta = {
  slug: SemaforoTipo;
  /** "Hombro" — nombre humano, se usa en títulos y UI del CRM. */
  nombre: string;
  /** "del Hombro" / "de la Lumbar" — para componer titulares. */
  nombreConArticulo: string;
  /** "El Semáforo del Hombro" — título completo de la landing. */
  pageTitle: string;
  /** Descripción SEO corta de la landing. */
  pageDescription: string;
  /** Ruta pública donde vive la landing de este tipo. */
  landingPath: string;
  /** Si está activado, aparece en el selector del panel admin. */
  active: boolean;
};

export const SEMAFORO_TIPOS: Record<SemaforoTipo, SemaforoTipoMeta> = {
  hombro: {
    slug: "hombro",
    nombre: "Hombro",
    nombreConArticulo: "del Hombro",
    pageTitle: "El Semáforo del Hombro · FisioFitCross",
    pageDescription:
      "Descubre qué movimientos del WOD puedes seguir haciendo, cuáles adaptar y cuáles parar. Sin quitar ejercicios a ciegas.",
    landingPath: "/semaforo",
    active: true,
  },
  lumbar: {
    slug: "lumbar",
    nombre: "Lumbar",
    nombreConArticulo: "del Lumbar",
    pageTitle: "El Semáforo del Lumbar · FisioFitCross",
    pageDescription:
      "¿Te duele la zona lumbar al entrenar? Descubre en 10 minutos qué puedes seguir haciendo, qué adaptar y qué parar, sin quitar ejercicios a ciegas.",
    landingPath: "/semaforo/lumbar",
    active: true,
  },
};

export const TIPOS_ACTIVOS: SemaforoTipoMeta[] = (Object.values(SEMAFORO_TIPOS) as SemaforoTipoMeta[]).filter(
  (t) => t.active,
);

/** True si el string es un slug de tipo válido y conocido. */
export function isSemaforoTipo(s: unknown): s is SemaforoTipo {
  return typeof s === "string" && s in SEMAFORO_TIPOS;
}

/** Parsea cualquier input (?tipo=xxx, searchParams, body JSON) a tipo válido. Default: "hombro". */
export function parseTipo(raw: unknown, fallback: SemaforoTipo = "hombro"): SemaforoTipo {
  return isSemaforoTipo(raw) ? raw : fallback;
}
