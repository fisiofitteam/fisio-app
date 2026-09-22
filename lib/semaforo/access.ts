import type { Role } from "@/lib/auth";

/** Roles que pueden acceder al panel interno del Semáforo. */
export function canAccessSemaforoPanel(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "setter" || role === "closer";
}

/** Solo CEO puede eliminar registros (compliance RGPD). */
export function canDeleteSemaforo(role: string): boolean {
  return role === "ceo";
}

export type SemaforoAccessRole = Role;
