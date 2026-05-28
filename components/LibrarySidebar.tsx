"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  {
    id: "programas",
    label: "Programas",
    icon: "📋",
    desc: "Plantillas multi-semana y Rolling",
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
    id: "workouts",
    label: "Workouts",
    icon: "⚡",
    desc: "Plantillas de WOD reutilizables",
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

// Secciones solo-CEO.
const ONBOARDING_SECTION = {
  id: "onboarding",
  label: "Onboarding",
  icon: "🚀",
  desc: "Cuestionario y contrato (CEO)",
};
const LANDINGS_SECTION = {
  id: "landings",
  label: "Landings",
  icon: "✨",
  desc: "Textos de las páginas de pago (CEO)",
};
const MENSAJES_SECTION = {
  id: "mensajes",
  label: "Mensajes",
  icon: "💬",
  desc: "Bienvenida de la app del paciente (CEO)",
};
const METRICAS_SECTION = {
  id: "metricas",
  label: "Métricas",
  icon: "📈",
  desc: "Métricas generales de todos los pacientes (CEO)",
};
// Editor del catálogo de control de cargas (CEO + Head Success).
const CATALOGO_SECTION = {
  id: "catalogo",
  label: "Catálogo cargas",
  icon: "🏋️",
  desc: "Bloques y ejercicios del control de cargas",
};

export function LibrarySidebar({ showOnboarding = false, showCatalog = false }: { showOnboarding?: boolean; showCatalog?: boolean }) {
  const pathname = usePathname() ?? "";
  const sections = [
    ...SECTIONS,
    ...(showCatalog ? [CATALOGO_SECTION] : []),
    ...(showOnboarding ? [METRICAS_SECTION, ONBOARDING_SECTION, LANDINGS_SECTION, MENSAJES_SECTION] : []),
  ];

  function isActive(id: string) {
    // "Programas" engloba también Rolling (subapartado).
    if (id === "programas") {
      return pathname.startsWith("/fisio/biblioteca/programas") || pathname.startsWith("/fisio/biblioteca/rolling");
    }
    return pathname.startsWith(`/fisio/biblioteca/${id}`);
  }

  return (
    <>
      {/* Pestañas horizontales arriba (todas las pantallas) */}
      <nav className="flex gap-1 overflow-x-auto border-b border-neutral-200 -mx-4 px-4 sm:mx-0 sm:px-0">
        {sections.map((s) => {
          const active = isActive(s.id);
          return (
            <Link
              key={s.id}
              href={`/fisio/biblioteca/${s.id}`}
              title={s.desc}
              className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                active
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-500 hover:text-neutral-900"
              }`}
            >
              <span className="mr-1">{s.icon}</span>
              {s.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
