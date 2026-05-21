"use client";

import Link from "next/link";

type Tab = { key: string; label: string; href: string };

const TABS: Tab[] = [
  { key: "this-week", label: "📍 Esta semana", href: "/fisio/contenido" },
  { key: "calendar", label: "📅 Calendario", href: "/fisio/contenido/calendario" },
  { key: "metrics", label: "📈 Métricas", href: "/fisio/contenido/metricas" },
  { key: "bank", label: "🗂 Banco recursos", href: "/fisio/contenido/banco" },
];

export function ContentNav({ active }: { active: string }) {
  return (
    <div className="mb-4 flex gap-1 border-b border-neutral-200 overflow-x-auto">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              isActive ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
