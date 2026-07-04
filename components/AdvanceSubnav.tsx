"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SUBTABS = [
  { id: "pulso", label: "📊 Pulso", href: "/fisio/advance" },
  { id: "atletas", label: "🏋 Atletas", href: "/fisio/advance/atletas" },
  { id: "rolling", label: "⚡ Rolling", href: "/fisio/advance/rolling" },
  { id: "retos", label: "🎯 Retos", href: "/fisio/advance/retos" },
  { id: "brief-ia", label: "✨ Brief IA", href: "/fisio/advance/brief-ia" },
];

// Sub-navegación dentro de la pestaña "Advance" del sidebar.
export function AdvanceSubnav() {
  const pathname = usePathname() ?? "";
  function isActive(id: string): boolean {
    if (id === "pulso") {
      return pathname === "/fisio/advance" || pathname === "/fisio/advance/";
    }
    return pathname.startsWith(`/fisio/advance/${id}`);
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
