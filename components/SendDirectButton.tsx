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
 * Formatea fecha + hora en varios formatos. Cada variante alimenta una
 * variable {cita.xxx} en la plantilla; el closer/fisio elige cuál usar según
 * cómo quiera que suene el mensaje.
 *
 *  - fecha:        "martes 5 de junio"
 *  - fecha_corta:  "5/6/2026"
 *  - dia:          "martes"
 *  - hora:         "17:30" (24h)
 *  - hora12:       "5:30 pm"
 *  - cuando:       "mañana", "hoy", "el martes", o fecha larga si > 7 días.
 */
export function formatCallDate(d: Date): {
  fecha: string;
  fecha_corta: string;
  dia: string;
  hora: string;
  hora12: string;
  cuando: string;
} {
  const fecha = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const fecha_corta = d.toLocaleDateString("es-ES", { day: "numeric", month: "numeric", year: "numeric" });
  const dia = d.toLocaleDateString("es-ES", { weekday: "long" });
  const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false });
  const hora12 = d.toLocaleTimeString("es-ES", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(" ", " ").toLowerCase();

  // Cuándo: relativo a hoy. Trabajamos con días al inicio del día.
  const start = (x: Date) => { const c = new Date(x); c.setHours(0, 0, 0, 0); return c; };
  const today = start(new Date());
  const target = start(d);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  let cuando: string;
  if (diffDays === 0) cuando = "hoy";
  else if (diffDays === 1) cuando = "mañana";
  else if (diffDays === -1) cuando = "ayer";
  else if (diffDays > 1 && diffDays <= 7) cuando = `el ${dia}`;
  else if (diffDays > 7 && diffDays <= 14) cuando = `el ${dia} que viene`;
  else cuando = fecha; // lejos en el futuro/pasado: usamos fecha larga directamente

  return { fecha, fecha_corta, dia, hora, hora12, cuando };
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
  alreadySent = false,
  onSent,
}: {
  template: Template;
  target: Target;
  className?: string;
  children?: React.ReactNode;
  /** Si true, se pinta en verde para marcar visualmente que ya se envió. Igual permite reenviar. */
  alreadySent?: boolean;
  /** Se llama justo después de abrir WhatsApp (o de copiar al portapapeles). Ideal para marcar en BD. */
  onSent?: () => void;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);

  function send(e: React.MouseEvent) {
    e.stopPropagation();

    const vars: Record<string, string | undefined | null> = {
      nombre: target.leadName,
      closer: target.closerFullName,
      fisio: target.closerFullName,
      "closer.intro": target.closerIntro ?? "",
      "fisio.intro": target.closerIntro ?? "",
    };

    if (template.actionType === "send_meeting_reminder" && target.callDate) {
      const f = formatCallDate(target.callDate);
      vars["cita.fecha"] = f.fecha;
      vars["cita.fecha_corta"] = f.fecha_corta;
      vars["cita.dia"] = f.dia;
      vars["cita.hora"] = f.hora;
      vars["cita.hora12"] = f.hora12;
      vars["cita.cuando"] = f.cuando;
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
      onSent?.();
      return;
    }
    window.open(url, "_blank", "noopener");
    onSent?.();
  }

  const defaultClass = alreadySent
    ? "text-xs font-medium px-2.5 py-1 rounded-md border bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
    : "text-xs font-medium px-2.5 py-1 rounded-md border border-neutral-200 bg-white hover:bg-neutral-50";

  return (
    <>
      <button
        onClick={send}
        className={className ?? defaultClass}
        title={
          alreadySent
            ? `Ya enviado. Pulsa para reenviar por WhatsApp.`
            : `Abre WhatsApp de ${target.leadName} con esta plantilla`
        }
      >
        {children ?? `${alreadySent ? "✅" : "📤"} ${template.name}`}
      </button>
      {feedback && (
        <span className="text-[11px] text-amber-700 ml-2 self-center">{feedback}</span>
      )}
    </>
  );
}
