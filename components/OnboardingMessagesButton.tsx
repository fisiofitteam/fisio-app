"use client";

/**
 * Botón + dropdown con plantillas de mensaje típicas del onboarding.
 * Aparece junto al toggle "Semana 0 completada" en cada fila de paciente
 * en la sección "🚀 Onboarding · Semana 0" de la lista de pacientes.
 *
 * Al elegir una plantilla:
 *   1. Sustituye {nombre} por el nombre del paciente.
 *   2. Copia el texto al portapapeles.
 *   3. Abre el whatsappGroupUrl del paciente en pestaña nueva (o wa.me al
 *      teléfono como fallback si no hay grupo).
 *
 * Plantillas editables aquí. Fácil de ampliar según necesidades del equipo.
 */

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Copy, Check } from "lucide-react";

type Template = {
  id: string;
  label: string;         // Título en el menú
  emoji: string;         // Icono corto para diferenciar
  body: string;          // Texto con {nombre} para sustituir
  target: "group" | "direct";  // Al grupo o al chat individual
};

/**
 * PLANTILLAS DE ONBOARDING — edita/añade libremente.
 * Placeholders soportados: {nombre}
 */
const TEMPLATES: Template[] = [
  {
    id: "presentacion-grupo",
    label: "Presentación en el grupo",
    emoji: "👋",
    target: "group",
    body:
`¡Buenas equipo! Damos la bienvenida a {nombre} 💪

Se une al grupo para trabajar todo el tema de dolor y rendimiento con nosotros. En los próximos días os iremos guiando paso a paso.

{nombre}, cuéntanos brevemente:
· ¿Cuál es tu dolor / molestia principal ahora mismo?
· ¿Qué buscas conseguir con nosotros?

¡Estamos aquí para ayudarte! 🚀`,
  },
  {
    id: "explicacion-semana0",
    label: "Explicación semana 0",
    emoji: "📚",
    target: "direct",
    body:
`Hola {nombre} 👋

Esta primera semana la llamamos "Semana 0" — es tu semana de configuración. En estos días vamos a:

1️⃣ Rellenar la anamnesis (el cuestionario clínico completo).
2️⃣ Firmar el contrato de servicio.
3️⃣ Programar tu primera sesión clínica conmigo.
4️⃣ Configurar tu app y explicarte cómo funciona.

Cuando terminemos esto, ya estarás dentro del programa 100%. Cualquier duda me dices por aquí.`,
  },
];

export function OnboardingMessagesButton({
  patientId,
  patientName,
  whatsappGroupUrl,
}: {
  patientId: string;
  patientName: string;
  whatsappGroupUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (btnRef.current && !btnRef.current.parentElement?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const firstName = patientName.split(" ")[0];

  async function send(t: Template, e: React.MouseEvent) {
    e.stopPropagation();
    const text = t.body.replace(/\{nombre\}/g, firstName);

    // Copiar al portapapeles (con try porque en http algunos navegadores fallan)
    try { await navigator.clipboard.writeText(text); } catch { /* noop */ }
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 2000);

    // Abrir WhatsApp según target
    const isDemoGroup = !!whatsappGroupUrl && whatsappGroupUrl.includes("DEMO_GROUP_LINK");
    if (t.target === "group" && whatsappGroupUrl && !isDemoGroup) {
      window.open(whatsappGroupUrl, "_blank", "noopener,noreferrer");
    }
    // Para "direct" no abrimos wa.me automático — algunas plantillas incluyen
    // placeholders [PEGA AQUÍ ...] que el fisio quiere rellenar antes.
    // El texto ya está en el portapapeles, listo para pegar en el chat.

    setOpen(false);
  }

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded border transition-colors"
        style={{
          background: "#FFFFFF",
          borderColor: "#FDE68A",
          color: "#78350F",
        }}
        title="Plantillas de mensaje del onboarding"
      >
        <MessageSquare size={12} />
        Mensaje
      </button>

      {open && (
        <div
          className="absolute z-40 mt-1 right-0 w-72 rounded-lg shadow-lg border overflow-hidden"
          style={{ background: "#FFFFFF", borderColor: "#E5E5E5" }}
        >
          <div className="px-3 py-2 border-b border-neutral-100 bg-neutral-50">
            <div className="text-[11px] font-semibold text-neutral-700">Plantillas de mensaje</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Se copia al portapapeles y abre el grupo (o solo copia si es directo).
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={(e) => send(t, e)}
                className="w-full text-left px-3 py-2.5 hover:bg-neutral-50 border-b border-neutral-100 last:border-b-0 flex items-center gap-2"
              >
                <span className="text-base flex-shrink-0">{t.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-neutral-900">{t.label}</div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    {t.target === "group" ? "→ Grupo de seguimiento" : "→ Copiar al portapapeles"}
                  </div>
                </div>
                {copiedId === t.id ? (
                  <Check size={13} className="text-emerald-600 flex-shrink-0" />
                ) : (
                  <Copy size={12} className="text-neutral-400 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
