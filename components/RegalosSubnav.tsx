"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SUBTABS = [
  { id: "parches", label: "🎁 Parches", href: "/fisio/regalos" },
  { id: "camisetas", label: "👕 Camisetas", href: "/fisio/regalos/camisetas" },
];

// Sub-navegación dentro de la pestaña "Regalos" del sidebar.
export function RegalosSubnav() {
  const pathname = usePathname() ?? "";
  function isActive(id: string): boolean {
    if (id === "parches") {
      return pathname === "/fisio/regalos" || pathname === "/fisio/regalos/";
    }
    return pathname.startsWith(`/fisio/regalos/${id}`);
  }

  return (
    <div className="flex gap-1 mb-4 overflow-x-auto -mx-4 px-4 pb-1">
      {SUBTABS.map((t) => {
        const active = isActive(t.id);
        return (
          <Link
            key={t.id}
            href={t.href}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              active ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
