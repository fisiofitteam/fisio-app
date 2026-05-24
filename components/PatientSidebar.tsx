"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  {
    id: "calendario",
    label: "Calendario",
    icon: "📅",
    desc: "Programas asignados y vista mensual",
  },
  {
    id: "cargas",
    label: "Control de cargas",
    icon: "🏋️",
    desc: "Adaptaciones por movimiento",
  },
  {
    id: "evolucion",
    label: "Evolución",
    icon: "📈",
    desc: "Métricas y progreso del paciente",
  },
  {
    id: "ficha",
    label: "Ficha clínica",
    icon: "🩺",
    desc: "Datos, diagnóstico, perfil",
  },
  {
    id: "suscripcion",
    label: "Suscripción",
    icon: "💳",
    desc: "Pago, programa, pausas",
  },
  {
    id: "formularios",
    label: "Formularios",
    icon: "📝",
    desc: "Cuestionarios rellenados",
  },
];

// Aparece solo si el paciente está en una sesión clínica.
const CLINICAL_SECTION = {
  id: "sesiones-clinicas",
  label: "Sesiones clínicas",
  icon: "🧠",
  desc: "Lo comentado en la sesión clínica",
};

export function PatientSidebar({ patientId, hasClinicalCase = false }: { patientId: string; hasClinicalCase?: boolean }) {
  const pathname = usePathname();
  const sections = hasClinicalCase ? [...SECTIONS, CLINICAL_SECTION] : SECTIONS;

  function isActive(id: string) {
    return pathname?.includes(`/fisio/paciente/${patientId}/${id}`);
  }

  return (
    <>
      {/* Móvil: tabs horizontales */}
      <nav className="md:hidden flex gap-1 overflow-x-auto pb-1">
        {sections.map((s) => {
          const active = isActive(s.id);
          return (
            <Link
              key={s.id}
              href={`/fisio/paciente/${patientId}/${s.id}`}
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
      <aside className="hidden md:block w-56 flex-shrink-0">
        <nav className="space-y-1">
          {sections.map((s) => {
            const active = isActive(s.id);
            return (
              <Link
                key={s.id}
                href={`/fisio/paciente/${patientId}/${s.id}`}
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
