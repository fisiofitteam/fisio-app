"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SUBTABS = [
  { id: "plantillas", label: "📋 Plantillas", href: "/fisio/biblioteca/programas" },
  { id: "rolling", label: "⚡ Rolling", href: "/fisio/biblioteca/rolling" },
];

// Sub-navegación dentro de la pestaña "Programas" (plantillas multi-semana y rolling).
export function ProgramsSubnav() {
  const pathname = usePathname() ?? "";
  const onRolling = pathname.startsWith("/fisio/biblioteca/rolling");

  return (
    <div className="flex gap-1 mb-4">
      {SUBTABS.map((t) => {
        const active = t.id === "rolling" ? onRolling : !onRolling;
        return (
          <Link
            key={t.id}
            href={t.href}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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
