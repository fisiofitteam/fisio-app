"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { id: "metricas", label: "📊 Resumen", href: "/fisio/anuncios/metricas", desc: "Gasto, nuevos seguidores y coste por seguidor" },
  { id: "campanas", label: "🗂️ Planificación", href: "/fisio/anuncios/campanas", desc: "Campañas → AdSets → Anuncios (organización interna)" },
  { id: "brief-ia", label: "🤖 Guiones IA", href: "/fisio/anuncios/brief-ia", desc: "Genera guiones de anuncio con IA" },
  { id: "banco", label: "🏦 Banco", href: "/fisio/anuncios/banco", desc: "Hooks y audiencias guardadas" },
  { id: "optimizador", label: "🧠 Optimizador IA", href: "/fisio/anuncios/optimizador", desc: "Recomendaciones de Claude" },
];

export function AdsSubnav() {
  const pathname = usePathname() ?? "";
  function active(href: string): boolean {
    return pathname === href || pathname.startsWith(href + "/");
  }
  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 border-b border-neutral-200 -mx-4 px-4 sm:mx-0 sm:px-0">
      {TABS.map((t) => {
        const isActive = active(t.href);
        return (
          <Link
            key={t.id}
            href={t.href}
            title={t.desc}
            className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              isActive ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
