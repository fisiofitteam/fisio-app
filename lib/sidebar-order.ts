import { itemsForRoles } from "@/lib/sidebar-items";
export const SIDEBAR_PAGES = Array.from(new Map(
  ["ceo", "head_success", "fisio", "setter", "closer"].flatMap(role =>
    itemsForRoles(role, [], { withResumenes: true }).map(({ id, label }) => [id, { id, label }] as const)
  )
).values());
export function sidebarIdsForRole(role: string, extraRoles: string[] = []): string[] {
  return itemsForRoles(role, extraRoles, { withResumenes: true }).map(item => item.id);
}
export function normalizeSidebarOrder(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(SIDEBAR_PAGES.map(p => p.id));
  return [...new Set(raw.filter((id): id is string => typeof id === "string" && known.has(id)))];
}
