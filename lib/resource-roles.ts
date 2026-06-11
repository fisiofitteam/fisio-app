// Tipos + utilidades server-safe para el filtro por rol de la sección Recursos.
// SIN "use client": Server Components y Client Components importan de aquí.
// (Si pones "use client" aquí, los Server Components revientan en runtime con
// "(0, i.XX) is not a function" al llamar a estas funciones — referencias RSC.)

export type ResourceRole = "ceo" | "head_success" | "fisio" | "setter" | "closer";

export const ROLE_LABELS: Record<ResourceRole, string> = {
  ceo: "CEO",
  head_success: "Head-success",
  fisio: "Fisios",
  setter: "Setter",
  closer: "Closer",
};

export const ROLE_ORDER: ResourceRole[] = ["ceo", "head_success", "fisio", "setter", "closer"];

/**
 * Tipos de acción que puede tener una MessageTemplate.
 *  - null            → plantilla normal: copia al portapapeles
 *  - send_success_case → muestra selector de SuccessCase, interpola, abre WhatsApp del lead/paciente
 *  (Reservados, no implementados: send_agenda, send_meeting_reminder)
 */
export type TemplateActionType = "send_success_case" | "send_agenda" | "send_meeting_reminder";

export const ACTION_TYPE_LABELS: Record<TemplateActionType, string> = {
  send_success_case: "Enviar caso de éxito",
  send_meeting_reminder: "Recordatorio de cita",
  send_agenda: "Enviar link de agenda",
};

// Acciones disponibles para seleccionar al crear/editar una plantilla.
export const ACTION_TYPES_IMPLEMENTED: TemplateActionType[] = [
  "send_success_case",
  "send_meeting_reminder",
  "send_agenda",
];

/**
 * Deserializa el campo `targetRoles` (JSON string) a un array tipado de roles.
 * Tolerante a basura: si el JSON está mal, devuelve ["ceo"] por defecto.
 */
export function parseTargetRoles(raw: string | null | undefined): ResourceRole[] {
  if (!raw) return ["ceo"];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return ["ceo"];
    const filtered = arr.filter((r): r is ResourceRole => typeof r === "string" && (ROLE_ORDER as string[]).includes(r));
    return filtered.length ? Array.from(new Set(filtered)) : ["ceo"];
  } catch {
    return ["ceo"];
  }
}

/**
 * Roles visibles para el usuario actual (qué tabs ve y qué plantillas se le muestran).
 *  - CEO            → todos
 *  - head_success   → todos menos "ceo"
 *  - el resto       → solo el suyo
 */
export function visibleRolesForUser(userRole: ResourceRole): ResourceRole[] {
  if (userRole === "ceo") return ROLE_ORDER;
  if (userRole === "head_success") return ROLE_ORDER.filter((r) => r !== "ceo");
  return [userRole];
}

/**
 * Roles que el usuario actual puede ASIGNAR al crear/editar una plantilla.
 *  - CEO            → todos
 *  - head_success   → todos menos "ceo"
 *  - el resto       → ninguno (no puede gestionar)
 */
export function assignableRolesForUser(userRole: ResourceRole): ResourceRole[] {
  if (userRole === "ceo") return ROLE_ORDER;
  if (userRole === "head_success") return ROLE_ORDER.filter((r) => r !== "ceo");
  return [];
}

/**
 * ¿El usuario puede crear/editar/borrar plantillas?
 * CEO + head_success.
 */
export function canManageResources(userRole: ResourceRole): boolean {
  return userRole === "ceo" || userRole === "head_success";
}

/**
 * ¿Esta plantilla es visible para el usuario, dada su lista de roles destino?
 * Devuelve true si la intersección con visibleRolesForUser(userRole) no es vacía.
 */
export function templateVisibleFor(targetRoles: ResourceRole[], userRole: ResourceRole): boolean {
  const visible = new Set(visibleRolesForUser(userRole));
  return targetRoles.some((r) => visible.has(r));
}

/**
 * Lee el rol activo del tab desde searchParams. Para usuarios que no pueden
 * filtrar (no son CEO ni head-success), siempre devuelve su propio rol.
 */
export function resolveActiveRole(
  professionalRole: ResourceRole,
  searchParamsRol: string | string[] | undefined,
): { role: ResourceRole | "all"; canFilter: boolean } {
  const canFilter = canManageResources(professionalRole);
  if (!canFilter) return { role: professionalRole, canFilter: false };

  const allowed = visibleRolesForUser(professionalRole);
  const raw = Array.isArray(searchParamsRol) ? searchParamsRol[0] : searchParamsRol;
  if (!raw || raw === "all") return { role: "all", canFilter: true };
  if (allowed.includes(raw as ResourceRole)) return { role: raw as ResourceRole, canFilter: true };
  return { role: "all", canFilter: true };
}
