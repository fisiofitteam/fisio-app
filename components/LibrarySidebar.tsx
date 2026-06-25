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
// Catálogo de movimientos: categorías y ejercicios.
const CATALOGO_SECTION = {
  id: "catalogo",
  label: "Catálogo de movimientos",
  icon: "📚",
  desc: "Categorías y ejercicios. Base de todo el control de cargas.",
};
// Controles de cargas: por cada categoría, niveles + reglas por movimiento.
const CONTROLES_CARGAS_SECTION = {
  id: "niveles-categoria",
  label: "Controles de cargas",
  icon: "🏋️",
  desc: "Niveles que tiene cada categoría y reglas por movimiento. La IA usa esto para sugerir el nivel de cada paciente.",
};
// Brief metodológico que alimenta la IA de control de cargas.
const LOAD_REVIEW_SECTION = {
  id: "control-cargas-ia",
  label: "Brief cargas IA",
  icon: "🧠",
  desc: "Metodología que usa la IA para sugerir controles de carga",
};
// Casos de éxito que el closer envía a leads (CEO + Head Success).
const CASOS_EXITO_SECTION = {
  id: "casos-exito",
  label: "Casos de éxito",
  icon: "🏆",
  desc: "Testimonios reales para enviar a leads",
};

export function LibrarySidebar({ showOnboarding = false, showCatalog = false }: { showOnboarding?: boolean; showCatalog?: boolean }) {
  const pathname = usePathname() ?? "";
  const sections = [
    ...SECTIONS,
    ...(showCatalog ? [CATALOGO_SECTION, CONTROLES_CARGAS_SECTION, CASOS_EXITO_SECTION] : []),
    ...(showOnboarding ? [METRICAS_SECTION, LOAD_REVIEW_SECTION, ONBOARDING_SECTION, LANDINGS_SECTION, MENSAJES_SECTION] : []),
  ];

  function isActive(id: string) {
    // Rolling vivía bajo "Programas" en biblioteca; ahora vive en /fisio/advance/rolling.
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
