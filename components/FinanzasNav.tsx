"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/fisio/finanzas", label: "Resumen", match: (p: string) => p === "/fisio/finanzas" },
  { href: "/fisio/finanzas/facturas", label: "Facturas equipo", match: (p: string) => p.startsWith("/fisio/finanzas/facturas") },
];

export function FinanzasNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex gap-1 border-b border-neutral-200 mb-4">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${
              active ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
