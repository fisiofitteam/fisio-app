"use client";

import { useState } from "react";
import { interpolate, buildWhatsAppUrl } from "@/lib/message-render";
import type { TemplateActionType } from "@/lib/resource-roles";

type Template = {
  id: string;
  name: string;
  body: string;
  actionType: TemplateActionType;
};

type Target = {
  leadName: string;
  leadPhone: string | null;
  closerFullName: string;
  closerIntro: string | null;
  /**
   * Datos opcionales que se interpolan según el actionType de la plantilla.
   * Para send_meeting_reminder: callDate (Date), meetingUrl (string|null).
   * Para send_agenda: por ahora no hay link real, se sustituye con "[Enlace agenda]".
   */
  callDate?: Date | null;
  meetingUrl?: string | null;
};

/**
 * Formatea fecha + hora en español, pensado para el recordatorio.
 * Devuelve [fechaLegible, horaCorta]. Ejemplo: "martes 5 de junio", "17:30".
 */
function formatCallDate(d: Date): { fecha: string; hora: string } {
  const fecha = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return { fecha, hora };
}

/**
 * Botón que, al clicarse, interpola la plantilla con los datos del target
 * y abre WhatsApp del lead en pestaña nueva. Sin pop-up intermedio (a
 * diferencia de SendCaseFlow, que pide elegir un caso).
 *
 * Usado para `send_meeting_reminder` y `send_agenda`.
 */
export function SendDirectButton({
  template,
  target,
  className,
  children,
}: {
  template: Template;
  target: Target;
  className?: string;
  children?: React.ReactNode;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);

  function send(e: React.MouseEvent) {
    e.stopPropagation();

    const vars: Record<string, string | undefined | null> = {
      nombre: target.leadName,
      closer: target.closerFullName,
      "closer.intro": target.closerIntro ?? "",
    };

    if (template.actionType === "send_meeting_reminder" && target.callDate) {
      const { fecha, hora } = formatCallDate(target.callDate);
      vars["cita.fecha"] = fecha;
      vars["cita.hora"] = hora;
      vars["cita.meet"] = target.meetingUrl ?? "";
    }

    if (template.actionType === "send_agenda") {
      // De momento sin link real configurado: sustituimos el token por el
      // placeholder que el closer cambiará a mano. Cuando tengamos los enlaces
      // de agenda por fisio, pasarán a través del prop target.
      vars["agenda.link"] = "[Enlace agenda]";
    }

    const text = interpolate(template.body, vars);
    const url = buildWhatsAppUrl(target.leadPhone, text);
    if (!url) {
      navigator.clipboard.writeText(text).then(() => {
        setFeedback("Sin teléfono — copié el mensaje al portapapeles.");
      }).catch(() => {
        setFeedback("Sin teléfono y no pude copiar.");
      });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }
    window.open(url, "_blank", "noopener");
  }

  return (
    <>
      <button
        onClick={send}
        className={className ?? "text-xs font-medium px-2.5 py-1 rounded-md border border-neutral-200 bg-white hover:bg-neutral-50"}
        title={`Abre WhatsApp de ${target.leadName} con esta plantilla`}
      >
        {children ?? `📤 ${template.name}`}
      </button>
      {feedback && (
        <span className="text-[11px] text-amber-700 ml-2 self-center">{feedback}</span>
      )}
    </>
  );
}
