/**
 * lib/content-formats.ts
 *
 * Catálogo centralizado de formatos de contenido y objetivos.
 * Reemplaza el viejo FORMAT_TEMPLATES (que tenía 7 formatos hardcoded con
 * estructura por defecto). Ahora son solo 5 formatos sencillos, y la
 * estructura de bloques se gestiona mediante ScriptTemplate (plantillas
 * de guion creadas por el usuario).
 */
import type React from "react";

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

// Color category: green (atraer/conectar), yellow (educar), red (convertir), purple (lanzamiento)
export type GoalColor = "green" | "yellow" | "red" | "purple";

export const GOALS: { value: GoalKey; label: string; color: GoalColor }[] = [
  { value: "atraer", label: "Atraer", color: "green" },
  { value: "conectar", label: "Conectar", color: "green" },
  { value: "educar", label: "Educar", color: "yellow" },
  { value: "convertir", label: "Convertir", color: "red" },
  { value: "lanzamiento", label: "Lanzamiento", color: "purple" },
];

export function goalLabel(value: string): string {
  return GOALS.find((g) => g.value === value)?.label ?? value;
}

export function goalColor(value: string): GoalColor {
  return GOALS.find((g) => g.value === value)?.color ?? "yellow";
}

// Tailwind classes para etiquetas de objetivo (chips que van encima del cuadro).
export const GOAL_COLOR_CLASSES: Record<GoalColor, string> = {
  green: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  yellow: "bg-amber-100 text-amber-800 border border-amber-200",
  red: "bg-red-100 text-red-800 border border-red-200",
  purple: "bg-violet-100 text-violet-800 border border-violet-200",
};

// HEX del FONDO (tono claro) y BORDER de la pieza del calendario, por color.
// Los usamos con inline styles para evitar problemas de Tailwind JIT purge
// con clases dinámicas y para poder hacer gradientes con background-image.
export const GOAL_TILE_HEX: Record<GoalColor, { bg: string; border: string }> = {
  green:  { bg: "#ECFDF5", border: "#A7F3D0" }, // emerald-50 / emerald-200
  yellow: { bg: "#FEFCE8", border: "#FDE68A" }, // amber-50 / amber-200
  red:    { bg: "#FEF2F2", border: "#FECACA" }, // red-50 / red-200
  purple: { bg: "#F5F3FF", border: "#DDD6FE" }, // violet-50 / violet-200
};

/**
 * Devuelve el estilo inline del fondo de una pieza según sus objetivos.
 *   - 0 goals → gris neutro (histórico).
 *   - 1 goal  → color plano.
 *   - 2+ goals → gradiente diagonal del color[0] al color[último].
 * El border toma el color dominante (color[0]).
 */
export function goalTileStyle(goals: GoalKey[]): React.CSSProperties {
  if (goals.length === 0) {
    return { background: "#F5F5F5", border: "1px solid transparent" };
  }
  const colors = goals.map((g) => GOAL_TILE_HEX[goalColor(g)]);
  if (colors.length === 1) {
    return { background: colors[0].bg, border: `1px solid ${colors[0].border}` };
  }
  // Gradiente entre extremos. Usamos linear-gradient a 135deg — se ve bien
  // en cuadros pequeños y respeta la diagonal de lectura izq→dcha.
  const first = colors[0];
  const last = colors[colors.length - 1];
  return {
    background: `linear-gradient(135deg, ${first.bg} 0%, ${last.bg} 100%)`,
    border: `1px solid ${first.border}`,
  };
}

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
