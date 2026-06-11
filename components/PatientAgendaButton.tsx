"use client";

import { useState, useRef, useEffect } from "react";
import { SendDirectButton } from "@/components/SendDirectButton";
import type { TemplateActionType } from "@/lib/resource-roles";

type Template = { id: string; name: string; body: string; actionType: TemplateActionType };

/**
 * Botón "📤 Enviar plantilla" para la ficha del paciente. Muestra un dropdown
 * con las plantillas disponibles para el fisio (típicamente `send_agenda` para
 * que el paciente reserve su llamada de optimización/renovación).
 * Cada plantilla se renderiza como SendDirectButton dentro del menú.
 *
 * Si no hay plantillas configuradas, no aparece nada (return null).
 */
export function PatientAgendaButton({
  templates,
  patientName,
  patientPhone,
  fisioFullName,
  fisioIntro,
}: {
  templates: Template[];
  patientName: string;
  patientPhone: string | null;
  fisioFullName: string;
  fisioIntro: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al clicar fuera.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (templates.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost text-xs"
        title="Enviar una plantilla al paciente por WhatsApp"
      >
        📤 Enviar plantilla
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-50 bg-white border border-neutral-200 rounded-lg shadow-lg p-1 min-w-[220px]">
          {templates.map((t) => (
            <div key={t.id} className="px-1 py-0.5">
              <SendDirectButton
                template={t}
                target={{
                  leadName: patientName.split(" ")[0],
                  leadPhone: patientPhone,
                  closerFullName: fisioFullName,
                  closerIntro: fisioIntro,
                }}
                className="text-left w-full text-xs px-2 py-1.5 rounded hover:bg-neutral-100"
              >
                📤 {t.name}
              </SendDirectButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
