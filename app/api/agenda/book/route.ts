/**
 * POST /api/agenda/book
 *
 * Público (sin auth). Recibe el formulario completo de la landing y:
 *  1. Valida los datos
 *  2. Comprueba que el slot sigue libre (race condition)
 *  3. Crea evento en Calendar con Meet automático
 *  4. Crea Lead en BD con todos los campos
 *  5. Auto-asigna closer según `whoseSlot()`
 *  6. Devuelve { leadId } para que el frontend redirija a /agenda/gracias
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createEventWithMeet, getMeetLink, listEvents } from "@/lib/googleCalendar";
import { whoseSlot } from "@/lib/scheduleResolver";
import { notifySetters } from "@/lib/notifications";

type BookBody = {
  fullName: string;
  email: string;
  phone: string;
  country: string;
  instagram: string;
  motivo: string;
  tratamientosPrevios: string;
  impactoCrossfit: string;
  startISO: string; // ISO del slot elegido
  endISO: string;
  // Atribución de marketing: la landing los toma del query string ?utm_*=...
  utmCampaign?: string;
  utmSource?: string;
  utmMedium?: string;
  utmContent?: string;
};

export async function POST(req: NextRequest) {
  let body: BookBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
  }

  // Validación campo a campo
  const required: (keyof BookBody)[] = [
    "fullName",
    "email",
    "phone",
    "country",
    "instagram",
    "motivo",
    "tratamientosPrevios",
    "impactoCrossfit",
    "startISO",
    "endISO",
  ];
  for (const k of required) {
    if (!body[k] || (typeof body[k] === "string" && !body[k].trim())) {
      return NextResponse.json({ ok: false, error: `Falta el campo: ${k}` }, { status: 400 });
    }
  }

  const startDate = new Date(body.startISO);
  const endDate = new Date(body.endISO);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ ok: false, error: "Fecha del slot inválida" }, { status: 400 });
  }
  if (startDate <= new Date()) {
    return NextResponse.json({ ok: false, error: "El slot ya ha pasado" }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const fullName = body.fullName.trim();
  const phone = body.phone.trim();
  // Normalizar el handle de Instagram: minúsculas, sin espacios, asegurando @ al inicio
  const igRaw = body.instagram.trim().replace(/^@+/, "").toLowerCase().replace(/\s+/g, "");
  const instagram = igRaw ? `@${igRaw}` : "";

  // ─── Comprobación última de disponibilidad (race condition) ───
  // En el tiempo entre que cargamos los slots y el lead pulsa "confirmar",
  // alguien podría haber agendado ese mismo slot. Comprobamos eventos
  // existentes que solapen.
  try {
    const events = await listEvents(body.startISO, body.endISO);
    const overlap = events.some(
      (e) =>
        e.status !== "cancelled" &&
        e.start?.dateTime &&
        e.end?.dateTime &&
        new Date(e.start.dateTime).getTime() < endDate.getTime() &&
        new Date(e.end.dateTime).getTime() > startDate.getTime()
    );
    if (overlap) {
      return NextResponse.json(
        { ok: false, error: "Lo sentimos, ese hueco se acaba de ocupar. Elige otro." },
        { status: 409 }
      );
    }
  } catch (e: any) {
    console.error("Check overlap error:", e);
    return NextResponse.json(
      { ok: false, error: "No pudimos verificar la disponibilidad. Inténtalo de nuevo." },
      { status: 500 }
    );
  }

  // ─── Crear evento en Calendar ───
  let calendarEvent;
  try {
    const description = [
      `Valoración FisioFit con ${fullName}`,
      ``,
      `Teléfono: ${phone}`,
      `Email: ${email}`,
      ``,
      `─── Cuestionario previo ───`,
      ``,
      `Motivo de consulta:`,
      body.motivo.trim(),
      ``,
      `Tratamientos previos probados:`,
      body.tratamientosPrevios.trim(),
      ``,
      `Cómo le afecta a su CrossFit:`,
      body.impactoCrossfit.trim(),
    ].join("\n");

    calendarEvent = await createEventWithMeet({
      title: `FisioFit Call · ${fullName}`,
      description,
      startISO: body.startISO,
      endISO: body.endISO,
      attendeeEmail: email,
      attendeeName: fullName,
    });
  } catch (e: any) {
    console.error("Calendar create error:", e);
    return NextResponse.json(
      { ok: false, error: "No pudimos crear la cita. Por favor inténtalo de nuevo en unos minutos." },
      { status: 500 }
    );
  }

  const meetingUrl = getMeetLink(calendarEvent);

  // ─── Auto-asignar closer según patrón semanal ───
  const closerId = await whoseSlot(startDate);

  // ─── Crear Lead ───
  const lead = await prisma.lead.create({
    data: {
      fullName,
      contactType: "email",
      contactValue: email,
      email,
      phone,
      country: body.country.trim(),
      instagram: instagram || null,
      motivo: body.motivo.trim(),
      tratamientosPrevios: body.tratamientosPrevios.trim(),
      impactoCrossfit: body.impactoCrossfit.trim(),
      callScheduledAt: startDate,
      status: "scheduled",
      source: "landing",
      bookedAt: new Date(),
      meetingUrl,
      googleEventId: calendarEvent.id,
      closerId: closerId || undefined,
      aiSummary: `Reservado desde landing. Motivo: ${body.motivo.trim().slice(0, 200)}`,
      // Atribución a anuncios (si la URL traía utms)
      adUtmCampaign: typeof body.utmCampaign === "string" && body.utmCampaign.trim() ? body.utmCampaign.trim().slice(0, 100) : null,
      adUtmSource: typeof body.utmSource === "string" && body.utmSource.trim() ? body.utmSource.trim().slice(0, 50) : null,
      adUtmMedium: typeof body.utmMedium === "string" && body.utmMedium.trim() ? body.utmMedium.trim().slice(0, 50) : null,
      adUtmContent: typeof body.utmContent === "string" && body.utmContent.trim() ? body.utmContent.trim().slice(0, 100) : null,
    },
  });

  // ─── Notificación in-app a setters ───
  // Flujo: el setter ve la notificación, contacta al lead por WhatsApp y le
  // dice quién es su closer. Cuando marca "avisado", se dispara la
  // notificación al closer (en /api/leads/notify-closer).
  try {
    const dateLabel = startDate.toLocaleDateString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    await notifySetters({
      type: "lead_new",
      title: `Lead nuevo · ${fullName}`,
      body: `Llamada el ${dateLabel}. Contáctale por WhatsApp y dile quién le atenderá.`,
      leadId: lead.id,
      actionUrl: "/fisio/llamadas-venta",
    });
  } catch (notifyError) {
    // Loggeamos pero no rompemos el flujo de booking
    console.error("Notification error:", notifyError);
  }

  return NextResponse.json({ ok: true, leadId: lead.id });
}
