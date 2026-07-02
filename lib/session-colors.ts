/**
 * Paleta de colores para las sesiones del paciente.
 *
 * Reglas por prioridad (la primera que aplique gana):
 *  1. Si la sesión contiene alguna tarea de tipo VIDEO → rojo.
 *  2. Si TODAS las tareas son de métricas (EVOLUTION o FORM) → azul claro.
 *  3. Si no, color rotativo por asignación en el paciente:
 *     verde → amarillo → violeta → naranja → verde ... (cíclico).
 *
 * Los colores se usan tanto en la vista del paciente (home + semana)
 * como en el calendario mensual del fisio.
 */

export type SessionColor = {
  /** Clases tailwind para fondo suave + texto legible. */
  bgClass: string;
  textClass: string;
  /** Border sutil para tarjetas que lo quieran destacar. */
  borderClass: string;
  /** Hex para casos donde tailwind no encaja (inline style). */
  accent: string;
};

// Índice → color. Cíclico si hay más de 4 programas asignados.
export const PROGRAM_PALETTE: SessionColor[] = [
  { bgClass: "bg-emerald-100", textClass: "text-emerald-900", borderClass: "border-emerald-300", accent: "#059669" }, // verde
  { bgClass: "bg-amber-100",   textClass: "text-amber-900",   borderClass: "border-amber-300",   accent: "#D97706" }, // amarillo
  { bgClass: "bg-purple-100",  textClass: "text-purple-900",  borderClass: "border-purple-300",  accent: "#7C3AED" }, // violeta
  { bgClass: "bg-orange-100",  textClass: "text-orange-900",  borderClass: "border-orange-300",  accent: "#EA580C" }, // naranja
];

export const VIDEO_COLOR: SessionColor = {
  bgClass: "bg-red-100",
  textClass: "text-red-900",
  borderClass: "border-red-300",
  accent: "#DC2626",
};

export const METRICS_COLOR: SessionColor = {
  bgClass: "bg-sky-100",
  textClass: "text-sky-900",
  borderClass: "border-sky-300",
  accent: "#0EA5E9",
};

export const COMPLETED_COLOR: SessionColor = {
  bgClass: "bg-emerald-50",
  textClass: "text-emerald-800",
  borderClass: "border-emerald-200",
  accent: "#10B981",
};

/**
 * Decide el color de una sesión. `assignmentIndex` es la posición
 * estable de su asignación entre los programas del paciente (0..N).
 * Puede pasarse -1 si no se conoce; se usará el primer color de la paleta.
 */
export function colorForSession(input: {
  tasksSnapshot: string;
  assignmentIndex: number;
  completed?: boolean;
}): SessionColor {
  if (input.completed) return COMPLETED_COLOR;
  try {
    const tasks = JSON.parse(input.tasksSnapshot);
    if (Array.isArray(tasks) && tasks.length > 0) {
      const hasVideo = tasks.some((t: any) => t?.type === "VIDEO");
      if (hasVideo) return VIDEO_COLOR;
      const allMetrics = tasks.every((t: any) => t?.type === "EVOLUTION" || t?.type === "FORM");
      if (allMetrics) return METRICS_COLOR;
    }
  } catch {}
  const idx = input.assignmentIndex >= 0
    ? input.assignmentIndex % PROGRAM_PALETTE.length
    : 0;
  return PROGRAM_PALETTE[idx];
}

/**
 * Dada una lista de asignaciones ordenadas de forma estable
 * (por startDate asc, luego por id), devuelve un mapa
 * assignmentId → índice para pasarlo a colorForSession.
 */
export function buildAssignmentIndexMap(
  assignments: { id: string; startDate: string | Date | null }[]
): Map<string, number> {
  const sorted = [...assignments].sort((a, b) => {
    const ta = a.startDate ? new Date(a.startDate).getTime() : 0;
    const tb = b.startDate ? new Date(b.startDate).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
  const map = new Map<string, number>();
  sorted.forEach((a, i) => map.set(a.id, i));
  return map;
}
