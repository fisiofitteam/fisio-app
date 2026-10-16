"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const BASE = "/fisio/finanzas";
const TABS = [
  { href: BASE, label: "💼 Negocio", key: "negocio" },
  { href: `${BASE}/captacion`, label: "📈 Captación", key: "captacion" },
  { href: `${BASE}/salud`, label: "🩺 Salud", key: "salud" },
  { href: `${BASE}/pagos`, label: "💳 Pagos", key: "pagos" },
  { href: `${BASE}/anual`, label: "📅 Anual", key: "anual" },
  { href: `${BASE}/diagnostico`, label: "🔎 Diagnóstico", key: "diagnostico" },
  { href: `${BASE}/vias`, label: "🧭 Vías", key: "vias" },
];
const TOOLS = [
  { href: `${BASE}/facturas`, label: "Facturas equipo" },
  { href: `${BASE}/facturas-pacientes`, label: "Facturas a pacientes" },
  { href: `${BASE}/anuncios`, label: "Anuncios" },
  { href: `${BASE}/metricas-negocio`, label: "Resumen anterior y objetivos" },
];

export function FinanzasNav() {
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const activeKey = TABS.find((t) => t.href !== BASE && pathname === t.href)?.key
    ?? (pathname === `${BASE}/metricas-negocio` ? "anual" : pathname === BASE ? "negocio" : null);
  const query = new URLSearchParams();
  for (const key of ["specificMonth", "year"]) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  const withPeriod = (href: string) => query.size ? `${href}?${query.toString()}` : href;

  return (
    <div className="mb-5">
      <header className="mb-3">
        <h1 className="text-xl font-semibold tracking-tight">Cuadro de mandos</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Negocio, captación y salud de FisioFitCross</p>
      </header>
      <nav aria-label="KPIs del negocio" className="flex gap-1 overflow-x-auto border-b border-neutral-200">
        {TABS.map((tab) => (
          <Link key={tab.key} href={withPeriod(tab.href)} aria-current={activeKey === tab.key ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${activeKey === tab.key ? "border-amber-500 font-medium text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"}`}>
            {tab.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Herramientas de finanzas" className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {TOOLS.map((tool) => (
          <Link key={tool.href} href={withPeriod(tool.href)}
            aria-current={pathname === tool.href || pathname.startsWith(tool.href + "/") ? "page" : undefined}
            className={pathname === tool.href || pathname.startsWith(tool.href + "/") ? "font-medium text-neutral-900 underline underline-offset-4" : "text-neutral-500 hover:text-neutral-900"}>
            {tool.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
