// Helpers server-safe para Tutoriales del equipo. Sin "use client".
// Patrón de filtrado por rol idéntico al de Mensajes/Recursos.

import type { ResourceRole } from "@/lib/resource-roles";
import { parseTargetRoles, templateVisibleFor } from "@/lib/resource-roles";

/** ¿Este rol puede crear/editar/borrar tutoriales? */
export function canManageTraining(role: string): boolean {
  return role === "ceo" || role === "head_success";
}

/** ¿El módulo es visible para este usuario? Combina published + targetRoles. */
export function moduleVisibleFor(
  rawTargetRoles: string,
  published: boolean,
  userRole: ResourceRole,
  canManage: boolean,
): boolean {
  // Los managers ven incluso los no publicados (para editar).
  if (!published && !canManage) return false;
  return templateVisibleFor(parseTargetRoles(rawTargetRoles), userRole);
}
