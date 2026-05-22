"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  {
    id: "programas",
    label: "Programas",
    icon: "📋",
    desc: "Plantillas multi-semana",
  },
  {
    id: "rolling",
    label: "Rolling",
    icon: "⚡",
    desc: "Programas \"a tiempo corrido\"",
  },
  {
    id: "perfiles",
    label: "Controles de cargas",
    icon: "🏋️",
    desc: "Protocolos por patología",
  },
  {
    id: "ejercicios",
    label: "Ejercicios",
    icon: "🎥",
    desc: "Con vídeo demostrativo",
  },
  {
    id: "formularios",
    label: "Formularios",
    icon: "📝",
    desc: "Cuestionarios reutilizables",
  },
  {
    id: "videos",
    label: "Vídeos",
    icon: "📹",
    desc: "Mini-clases y educacional",
  },
];

export function LibrarySidebar() {
  const pathname = usePathname() ?? "";

  function isActive(id: string) {
    return pathname.startsWith(`/fisio/biblioteca/${id}`);
  }

  return (
    <>
      {/* Móvil: tabs horizontales */}
      <nav className="md:hidden flex gap-1 overflow-x-auto pb-1 -mx-4 px-4">
        {SECTIONS.map((s) => {
          const active = isActive(s.id);
          return (
            <Link
              key={s.id}
              href={`/fisio/biblioteca/${s.id}`}
              className={`px-3 py-2 text-xs rounded-lg whitespace-nowrap ${
                active ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200"
              }`}
            >
              {s.icon} {s.label}
            </Link>
          );
        })}
      </nav>

      {/* Desktop: sidebar vertical */}
      <aside className="hidden md:block w-52 flex-shrink-0">
        <nav className="space-y-1">
          {SECTIONS.map((s) => {
            const active = isActive(s.id);
            return (
              <Link
                key={s.id}
                href={`/fisio/biblioteca/${s.id}`}
                className={`block p-3 rounded-lg transition-colors ${
                  active ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{s.label}</div>
                    <div className={`text-xs mt-0.5 ${active ? "text-neutral-300" : "text-neutral-500"}`}>
                      {s.desc}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
