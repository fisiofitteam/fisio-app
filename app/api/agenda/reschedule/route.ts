/**
 * POST /api/agenda/reschedule
 *
 * Endpoint PÚBLICO (sin auth — se valida por token).
 * El lead, desde la landing /agenda/reagendar/[token], elige un nuevo hueco
 * y aquí:
 *  1. Validamos el token y que el lead siga en estado "scheduled".
 *  2. Comprobamos que el slot nuevo siga libre (race condition).
 *  3. Borramos el evento de Calendar anterior (best-effort).
 *  4. Creamos un evento nuevo con Meet (reutilizando los datos del lead).
 *  5. Reasignamos closer según patrón semanal (whoseSlot).
 *  6. Actualizamos el lead (callScheduledAt, googleEventId, meetingUrl,
 *     closerId, rescheduledAt).
 *  7. Notificamos a los setters (lead reagendado) y al closer asignado.
 *
 * Body: { token: string; startISO: string; endISO: string }
 * Devuelve: { ok, leadId, firstName, startISO } para que el cliente redirija
 * a la misma página de gracias que usa el booking original.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createEventWithMeet,
  deleteEvent,
  getMeetLink,
  listEvents,
} from "@/lib/googleCalendar";
import { whoseSlot } from "@/lib/scheduleResolver";
import { notifySetters, notifyProfessional } from "@/lib/notifications";

type Body = { token?: string; startISO?: string; endISO?: string };

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });
  }

  const token = (body.token || "").trim();
  const startISO = (body.startISO || "").trim();
  const endISO = (body.endISO || "").trim();
  if (!token || !startISO || !endISO) {
    return NextResponse.json({ ok: false, error: "Faltan datos" }, { status: 400 });
  }

  const startDate = new Date(startISO);
  const endDate = new Date(endISO);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ ok: false, error: "Fecha del slot inválida" }, { status: 400 });
  }
  if (startDate <= new Date()) {
    return NextResponse.json({ ok: false, error: "El slot ya ha pasado" }, { status: 400 });
  }

  // ─── Resolver lead por token ───
  const lead = await prisma.lead.findUnique({ where: { rescheduleToken: token } });
  if (!lead) {
    return NextResponse.json(
      { ok: false, error: "Enlace no válido o caducado." },
      { status: 404 }
    );
  }
  if (lead.status !== "scheduled") {
    return NextResponse.json(
      { ok: false, error: "Esta cita ya no se puede modificar. Contacta con tu asesor." },
      { status: 400 }
    );
  }
  if (!lead.email) {
    // Sin email no podemos crear el evento (Calendar exige attendee).
    return NextResponse.json(
      { ok: false, error: "Falta el email del lead. Contacta con tu asesor." },
      { status: 400 }
    );
  }

  // ─── Comprobar disponibilidad real en Calendar ───
  try {
    const events = await listEvents(startISO, endISO);
    const overlap = events.some(
      (e) =>
        e.status !== "cancelled" &&
        // No contamos el evento actual del propio lead si por algún caso raro
        // viniera devuelto (no debería porque vamos a borrarlo, pero por
        // seguridad lo ignoramos).
        e.id !== lead.googleEventId &&
        e.start?.dateTime &&
        e.end?.dateTime &&
        new Date(e.start.dateTime).getTime() < endDate.getTime() &&
        new Date(e.end.dateTime).getTime() > startDate.getTime()
    );
    if (overlap) {
      return NextResponse.json(
        { ok: false, error: "Ese hueco se acaba de ocupar. Elige otro." },
        { status: 409 }
      );
    }
  } catch (e: any) {
    console.error("Reschedule check overlap error:", e);
    return NextResponse.json(
      { ok: false, error: "No pudimos verificar la disponibilidad. Inténtalo de nuevo." },
      { status: 500 }
    );
  }

  // ─── Borrar evento anterior (best-effort) ───
  if (lead.googleEventId) {
    try {
      await deleteEvent(lead.googleEventId);
    } catch (e: any) {
      // No bloqueamos por esto: si el borrado falla, los dos eventos quedarían
      // en el calendar pero el de la cita nueva sí se crearía. Loggeamos para
      // que el equipo pueda limpiar a mano.
      console.error("Reschedule delete old event error:", e);
    }
  }

  // ─── Crear evento nuevo con Meet ───
  let calendarEvent;
  try {
    const description = [
      `Valoración FisioFit con ${lead.fullName}`,
      `(Cita re-agendada por el lead desde el enlace).`,
      ``,
      `Teléfono: ${lead.phone || "—"}`,
      `Email: ${lead.email}`,
      ``,
      `─── Cuestionario previo ───`,
      ``,
      `Motivo de consulta:`,
      lead.motivo || "—",
      ``,
      `Tratamientos previos probados:`,
      lead.tratamientosPrevios || "—",
      ``,
      `Cómo le afecta a su CrossFit:`,
      lead.impactoCrossfit || "—",
    ].join("\n");

    calendarEvent = await createEventWithMeet({
      title: `FisioFit Call · ${lead.fullName}`,
      description,
      startISO,
      endISO,
      attendeeEmail: lead.email,
      attendeeName: lead.fullName,
    });
  } catch (e: any) {
    console.error("Reschedule create event error:", e);
    return NextResponse.json(
      { ok: false, error: "No pudimos crear la cita nueva. Inténtalo de nuevo en unos minutos." },
      { status: 500 }
    );
  }

  const meetingUrl = getMeetLink(calendarEvent);

  // ─── Reasignar closer según el patrón semanal del nuevo slot ───
  // Si no hay closer cubriendo el slot (no debería pasar porque getAvailableSlots
  // solo devuelve huecos cubiertos), conservamos el closer original.
  const newCloserId = (await whoseSlot(startDate)) || lead.closerId;

  // ─── Persistir cambios ───
  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      callScheduledAt: startDate,
      googleEventId: calendarEvent.id,
      meetingUrl,
      closerId: newCloserId || undefined,
      rescheduledAt: new Date(),
      // Reset de estados intermedios del workflow: si el closer ya había
      // "contactado" o enviado recordatorio, esos pasos pueden tener fecha
      // antigua que ya no aplica. Los reseteamos para que el flujo vuelva
      // a empezar desde "setter avisó".
      closerContactedAt: null,
      reminderSentAt: null,
    },
  });

  // ─── Notificaciones in-app ───
  // 1. A los setters: "Lead X reagendó su cita".
  // 2. Al closer asignado: si cambió, le avisamos que tiene un lead nuevo;
  //    si no cambió, le avisamos del nuevo horario.
  try {
    const dateLabel = startDate.toLocaleDateString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    await notifySetters({
      type: "lead_rescheduled",
      title: `Lead re-agendado · ${lead.fullName}`,
      body: `Nueva cita el ${dateLabel}.`,
      leadId: lead.id,
      actionUrl: "/fisio/llamadas-venta",
    });
    if (newCloserId) {
      const closerChanged = newCloserId !== lead.closerId;
      await notifyProfessional({
        professionalId: newCloserId,
        type: "lead_rescheduled",
        title: closerChanged
          ? `Lead asignado (re-agendado) · ${lead.fullName}`
          : `Lead re-agendado · ${lead.fullName}`,
        body: `Nueva cita el ${dateLabel}.`,
        leadId: lead.id,
        actionUrl: "/fisio/llamadas-venta",
      });
    }
  } catch (notifyError) {
    console.error("Reschedule notification error:", notifyError);
  }

  return NextResponse.json({
    ok: true,
    leadId: updated.id,
    firstName: lead.fullName.split(" ")[0],
    startISO,
  });
}
