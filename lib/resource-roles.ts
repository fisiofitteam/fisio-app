// Tipos + utilidades server-safe para el filtro por rol de la sección Recursos.
// SIN "use client": para que los Server Components puedan importar
// `resolveActiveRole` y `ROLE_LABELS` directamente. El tab visual vive en
// `components/ResourceRoleTabs.tsx` (ese sí es client).

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
 * Lee el rol activo desde searchParams. Para no-CEO siempre devuelve su propio rol.
 */
export function resolveActiveRole(
  professionalRole: ResourceRole,
  searchParamsRol: string | string[] | undefined,
): { role: ResourceRole | "all"; isCeo: boolean } {
  const isCeo = professionalRole === "ceo";
  if (!isCeo) return { role: professionalRole, isCeo: false };

  const raw = Array.isArray(searchParamsRol) ? searchParamsRol[0] : searchParamsRol;
  if (!raw || raw === "all") return { role: "all", isCeo: true };
  if (ROLE_ORDER.includes(raw as ResourceRole)) return { role: raw as ResourceRole, isCeo: true };
  return { role: "all", isCeo: true };
}
