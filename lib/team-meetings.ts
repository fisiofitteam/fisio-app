// Permisos y constantes del sistema de Reuniones (TeamMeeting + ClinicalSessionCase).

export type MeetingCategory = "head_success" | "comercial" | "clinical" | "other";

export const MEETING_CATEGORIES: { key: MeetingCategory; label: string }[] = [
  { key: "head_success", label: "Reuniones Head Success" },
  { key: "comercial", label: "Reuniones Equipo Comercial" },
  { key: "clinical", label: "Sesiones Clínicas" },
  { key: "other", label: "Otras" },
];

/**
 * Devuelve qué categorías de reunión PUEDE VER un rol dado. La pestaña "other"
 * filtra después por attendeeIds + managers.
 */
export function visibleCategoriesFor(role: string): MeetingCategory[] {
  if (role === "ceo") return ["head_success", "comercial", "clinical", "other"];
  if (role === "head_success") return ["head_success", "clinical", "other"];
  if (role === "setter") return ["comercial", "other"];
  if (role === "closer") return ["comercial", "other"];
  if (role === "fisio") return ["clinical", "other"];
  return [];
}

/**
 * "Managers" = quienes pueden preparar/crear/editar reuniones de cada categoría.
 *   head_success: CEO + head_success
 *   comercial: CEO + setter
 *   clinical: CEO + head_success (sesiones clínicas las llevan los managers clínicos)
 *   other: CEO + head_success + setter (cualquier manager del equipo)
 */
export function isManagerForCategory(role: string, category: MeetingCategory): boolean {
  if (role === "ceo") return true;
  if (category === "head_success") return role === "head_success";
  if (category === "comercial") return role === "setter";
  if (category === "clinical") return role === "head_success";
  if (category === "other") return role === "head_success" || role === "setter";
  return false;
}

/**
 * Para "other": valida si el usuario puede ver el resumen de esta reunión.
 * El manager siempre puede; el resto solo si está en attendeeIds.
 */
export function canSeeOtherMeeting(
  role: string,
  professionalId: string,
  attendeeIds: string[],
): boolean {
  if (isManagerForCategory(role, "other")) return true;
  return attendeeIds.includes(professionalId);
}

export function parseAttendeeIds(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const a = JSON.parse(json);
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
