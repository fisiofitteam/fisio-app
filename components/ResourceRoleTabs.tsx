"use client";

import { useRouter, usePathname } from "next/navigation";
import { ROLE_LABELS, ROLE_ORDER, type ResourceRole } from "@/lib/resource-roles";

/**
 * Tabs de filtro por rol para las sub-secciones de Recursos.
 * - CEO: ve los 6 tabs (Todos + cada rol).
 * - Resto: no se muestra (solo verá lo suyo, server-side).
 *
 * El tab activo va en la query string `?rol=...` para que la página
 * (Server Component) pueda leerlo y filtrar.
 */
export function ResourceRoleTabs({ isCeo, currentRole }: { isCeo: boolean; currentRole: ResourceRole | "all" }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";

  if (!isCeo) return null;

  function setRole(role: ResourceRole | "all") {
    const target = role === "all" ? pathname : `${pathname}?rol=${role}`;
    router.push(target);
  }

  const tabs: { value: ResourceRole | "all"; label: string }[] = [
    { value: "all", label: "Todos" },
    ...ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
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
