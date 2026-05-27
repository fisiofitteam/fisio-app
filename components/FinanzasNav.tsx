"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Cuadro de mandos: dos niveles.
//  - Nivel 1 (secciones): Finanzas | Métricas globales del negocio
//  - Nivel 2 (subpestañas de Finanzas): Resumen | Facturas equipo
const SECTIONS = [
  { href: "/fisio/finanzas/metricas-negocio", label: "📈 Métricas globales del negocio", key: "metricas" },
  { href: "/fisio/finanzas", label: "💶 Finanzas", key: "finanzas" },
];

const FINANZAS_SUBTABS = [
  { href: "/fisio/finanzas", label: "Resumen", match: (p: string) => p === "/fisio/finanzas" },
  { href: "/fisio/finanzas/facturas", label: "Facturas equipo", match: (p: string) => p.startsWith("/fisio/finanzas/facturas") },
];

export function FinanzasNav() {
  const pathname = usePathname() ?? "";
  const inMetricas = pathname.startsWith("/fisio/finanzas/metricas-negocio");
  const section = inMetricas ? "metricas" : "finanzas";

  return (
    <div className="mb-4">
      <header className="mb-3">
        <h1 className="text-xl font-semibold">Cuadro de mandos</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Finanzas y métricas globales del negocio</p>
      </header>

      {/* Nivel 1 — secciones */}
      <nav className="flex gap-1 border-b border-neutral-200">
        {SECTIONS.map((s) => {
          const active = s.key === section;
          return (
            <Link
              key={s.key}
              href={s.href}
              className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                active ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>

      {/* Nivel 2 — subpestañas de Finanzas */}
      {section === "finanzas" && (
        <nav className="flex gap-1 mt-3">
          {FINANZAS_SUBTABS.map((t) => {
            const active = t.match(pathname);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
