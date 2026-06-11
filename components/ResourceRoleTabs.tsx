"use client";

import { useRouter, usePathname } from "next/navigation";
import { ROLE_LABELS, type ResourceRole } from "@/lib/resource-roles";

/**
 * Tabs de filtro por rol para las sub-secciones de Recursos.
 * Recibe los roles disponibles ya filtrados desde el server (CEO ve todos,
 * head-success ve todos menos "ceo", el resto no llega a renderizar esto).
 *
 * El tab activo va en la query string `?rol=...`.
 */
export function ResourceRoleTabs({
  allowedRoles,
  currentRole,
}: {
  allowedRoles: ResourceRole[];
  currentRole: ResourceRole | "all";
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";

  if (allowedRoles.length <= 1) return null;

  function setRole(role: ResourceRole | "all") {
    const target = role === "all" ? pathname : `${pathname}?rol=${role}`;
    router.push(target);
  }

  const tabs: { value: ResourceRole | "all"; label: string }[] = [
    { value: "all", label: "Todos" },
    ...allowedRoles.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
  ];

  return (
    <nav className="flex gap-1 mb-4 overflow-x-auto -mx-4 px-4 pb-1">
      {tabs.map((t) => {
        const active = t.value === currentRole;
        return (
          <button
            key={t.value}
            onClick={() => setRole(t.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              active ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
