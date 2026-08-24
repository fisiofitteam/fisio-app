"use client";

import Link from "next/link";

type Tab = { key: string; label: string; href: string; ceoOnly?: boolean; external?: boolean };

const TABS: Tab[] = [
  { key: "calendar", label: "📅 Calendario", href: "/fisio/contenido/calendario" },
  { key: "this-week", label: "📍 Esta semana", href: "/fisio/contenido" },
  { key: "dossier", label: "📄 Dossier", href: "/fisio/contenido/dossier" },
  { key: "template", label: "🧩 Plantillas", href: "/fisio/contenido/plantilla" },
  // El editor Story Maker vive en /fisio/contenido/story-maker (page Next
  // con iframe embebido a /storymaker). Así se queda dentro de la app.
  { key: "story-maker", label: "🎨 Story Maker", href: "/fisio/contenido/story-maker" },
  { key: "carousel-maker", label: "🎞 Carrusel Maker", href: "/fisio/contenido/carrusel-maker" },
  { key: "metrics", label: "📈 Métricas", href: "/fisio/contenido/metricas" },
  { key: "bank", label: "🗂 Banco recursos", href: "/fisio/contenido/banco" },
  { key: "brief-ia", label: "✨ Brief IA", href: "/fisio/contenido/brief-ia", ceoOnly: true },
];

export function ContentNav({ active, role }: { active: string; role?: string }) {
  const visibleTabs = TABS.filter((t) => !t.ceoOnly || role === "ceo");
  return (
    <div className="mb-4 flex gap-1 border-b border-neutral-200 overflow-x-auto">
      {visibleTabs.map((tab) => {
        const isActive = active === tab.key;
        const className = `px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
          isActive ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
        }`;
        // external=true → <a> normal (fuerza full-page navigation al HTML
        // servido por route handler, sin router SPA de Next intentando
        // hidratarlo como page.tsx).
        if (tab.external) {
          return (
            <a key={tab.key} href={tab.href} className={className}>
              {tab.label}
            </a>
          );
        }
        return (
          <Link key={tab.key} href={tab.href} className={className}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
