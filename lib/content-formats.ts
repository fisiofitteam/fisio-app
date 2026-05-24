/**
 * lib/content-formats.ts
 *
 * Catálogo centralizado de formatos de contenido y objetivos.
 * Reemplaza el viejo FORMAT_TEMPLATES (que tenía 7 formatos hardcoded con
 * estructura por defecto). Ahora son solo 5 formatos sencillos, y la
 * estructura de bloques se gestiona mediante ScriptTemplate (plantillas
 * de guion creadas por el usuario).
 */

export type FormatKey = "reel" | "carousel" | "infographic" | "image" | "live";

export const FORMATS: { value: FormatKey; label: string; icon: string }[] = [
  { value: "reel", label: "Reel", icon: "🎬" },
  { value: "carousel", label: "Carrusel", icon: "🎞️" },
  { value: "infographic", label: "Infografía", icon: "📝" },
  { value: "image", label: "Imagen/foto", icon: "📸" },
  { value: "live", label: "Directo", icon: "🔴" },
];

export function formatLabel(value: string): string {
  const f = FORMATS.find((f) => f.value === value);
  if (!f) return value;
  return `${f.icon} ${f.label}`;
}

export function formatLabelOnly(value: string): string {
  return FORMATS.find((f) => f.value === value)?.label ?? value;
}

export function formatIcon(value: string): string {
  return FORMATS.find((f) => f.value === value)?.icon ?? "";
}

// ─── Objetivos ─────────────────────────────────────────────────────────

export type GoalKey = "atraer" | "conectar" | "educar" | "convertir" | "lanzamiento";

// Color category: green (atraer/conectar), yellow (educar), red (convertir/lanzamiento)
export type GoalColor = "green" | "yellow" | "red";

export const GOALS: { value: GoalKey; label: string; color: GoalColor }[] = [
  { value: "atraer", label: "Atraer", color: "green" },
  { value: "conectar", label: "Conectar", color: "green" },
  { value: "educar", label: "Educar", color: "yellow" },
  { value: "convertir", label: "Convertir", color: "red" },
  { value: "lanzamiento", label: "Lanzamiento", color: "red" },
];

export function goalLabel(value: string): string {
  return GOALS.find((g) => g.value === value)?.label ?? value;
}

export function goalColor(value: string): GoalColor {
  return GOALS.find((g) => g.value === value)?.color ?? "yellow";
}

// Tailwind classes para etiquetas de objetivo
export const GOAL_COLOR_CLASSES: Record<GoalColor, string> = {
  green: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  yellow: "bg-amber-100 text-amber-800 border border-amber-200",
  red: "bg-red-100 text-red-800 border border-red-200",
};

/**
 * Parse goals desde JSON string almacenado en BD.
 * Devuelve siempre un array (vacío si no es válido).
 */
export function parseGoals(raw: string | null | undefined): GoalKey[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((g): g is GoalKey =>
      GOALS.some((G) => G.value === g)
    );
  } catch {
    return [];
  }
}

/**
 * Serializa array de goals a JSON string para guardar en BD.
 */
export function stringifyGoals(goals: GoalKey[]): string {
  return JSON.stringify(goals);
}


/**
 * Calcula la fecha real de publicación de una pieza a partir del startDate de su
 * semana y su dayOfWeek (1=lunes, 7=domingo). Reemplaza el antiguo scheduledAt.
 * Devuelve un objeto Date o null si falta info.
 */
export function piecePublishDate(weekStartDate: string | Date | null, dayOfWeek: number): Date | null {
  if (!weekStartDate) return null;
  const start = typeof weekStartDate === "string" ? new Date(weekStartDate) : weekStartDate;
  if (isNaN(start.getTime())) return null;
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + (dayOfWeek - 1));
  return d;
}

/**
 * Versión que devuelve directamente el ISO string para pasar a un componente cliente.
 */
export function piecePublishDateIso(weekStartDate: string | Date | null, dayOfWeek: number): string | null {
  const d = piecePublishDate(weekStartDate, dayOfWeek);
  return d ? d.toISOString() : null;
}
