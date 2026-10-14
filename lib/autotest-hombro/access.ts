import type { Role } from "@/lib/auth";

/** Roles que pueden ver el panel del Autotest Funcional del Hombro. */
export function canAccessAutotestPanel(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "setter" || role === "closer";
}

/** Solo CEO puede borrar registros (compliance RGPD). */
export function canDeleteAutotest(role: string): boolean {
  return role === "ceo";
}

export type AutotestAccessRole = Role;
