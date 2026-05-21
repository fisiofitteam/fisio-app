"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { id: "mensajes", label: "Mensajes prefijados", icon: "💬", desc: "Plantillas para pacientes" },
  { id: "formacion", label: "Formación", icon: "📚", desc: "Próximamente" },
  { id: "documentos", label: "Documentos", icon: "📄", desc: "Próximamente" },
];

export function ResourcesSidebar() {
  const pathname = usePathname() ?? "";

  function isActive(id: string) {
    return pathname.startsWith(`/fisio/recursos/${id}`);
  }

  return (
    <>
      <nav className="md:hidden flex gap-1 overflow-x-auto pb-1 -mx-4 px-4">
        {SECTIONS.map((s) => {
          const active = isActive(s.id);
          return (
            <Link
              key={s.id}
              href={`/fisio/recursos/${s.id}`}
              className={`px-3 py-2 text-xs rounded-lg whitespace-nowrap ${
                active ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200"
              }`}
            >
              {s.icon} {s.label}
            </Link>
          );
        })}
      </nav>

      <aside className="hidden md:block w-52 flex-shrink-0">
        <nav className="space-y-1">
          {SECTIONS.map((s) => {
            const active = isActive(s.id);
            return (
              <Link
                key={s.id}
                href={`/fisio/recursos/${s.id}`}
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
