/**
 * Helpers de alto nivel para interactuar con Google Calendar.
 *
 * Centraliza la gestión del access_token (refresca automáticamente cuando
 * expira) y proporciona métodos sencillos para leer y crear eventos en la
 * agenda compartida seleccionada en Integraciones.
 */
import { prisma } from "@/lib/prisma";
import { getOrganizationalConnection } from "@/lib/google-connection";
import { encrypt, decrypt } from "@/lib/encryption";
import { refreshAccessToken } from "@/lib/googleOAuth";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

// Margen de seguridad: si el token expira en menos de 60s, lo refrescamos.
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/**
 * Obtiene un access_token válido (refresca si expiró) para el ámbito indicado:
 *  - undefined → conexión compartida seleccionada.
 *  - googleEmail → cuenta organizadora de un evento existente.
 *  - un professionalId concreto → conexión personal de ese fisio.
 *
 * Lanza un error si no hay conexión disponible para el ámbito pedido.
 */
export async function getValidAccessToken(scope?: { professionalId?: string | null; googleEmail?: string | null }): Promise<string> {
  const professionalId = scope?.professionalId ?? null;
  const conn = scope?.googleEmail
    ? await prisma.googleCalendarConnection.findUnique({ where: { googleEmail: scope.googleEmail } })
    : professionalId
      ? await prisma.googleCalendarConnection.findUnique({ where: { professionalId } })
      : await getOrganizationalConnection();
  if (!conn) {
    throw new Error(
      scope?.googleEmail
        ? "La cuenta organizadora de esta llamada ya no está conectada a Google Calendar."
        : professionalId
        ? "Este fisio no tiene su Google Calendar conectado (Ajustes → Integraciones → Mi cuenta personal)."
        : "No hay Google Calendar conectado. Conéctalo en Ajustes → Integraciones.",
    );
  }

  const now = Date.now();
  const expiresAt = conn.tokenExpiresAt.getTime();

  if (expiresAt > now + TOKEN_EXPIRY_MARGIN_MS) {
    // Token todavía válido
    await prisma.googleCalendarConnection.update({
      where: { id: conn.id },
      data: { lastUsedAt: new Date() },
    });
    return decrypt(conn.accessTokenEnc);
  }

  // Token expirado: hay que refrescar
  if (!conn.refreshTokenEnc) {
    throw new Error("Token expirado y no hay refresh_token. Reconecta Google Calendar.");
  }
  const refreshToken = decrypt(conn.refreshTokenEnc);
  const newTokens = await refreshAccessToken(refreshToken);
  const newAccess = newTokens.access_token;
  const newExpiresAt = new Date(now + newTokens.expires_in * 1000);

  await prisma.googleCalendarConnection.update({
    where: { id: conn.id },
    data: {
      accessTokenEnc: encrypt(newAccess),
      tokenExpiresAt: newExpiresAt,
      lastUsedAt: new Date(),
      // Algunos refrescos devuelven también nuevo refresh_token
      ...(newTokens.refresh_token && {
        refreshTokenEnc: encrypt(newTokens.refresh_token),
      }),
    },
  });

  return newAccess;
}

/** Calendar and token must use the same selected connection. */
async function getCalendarId(): Promise<string> {
  const conn = await getOrganizationalConnection();
  if (!conn) throw new Error("No hay conexión Google compartida");
  return conn.googleEmail;
}

type CalendarEventTime = {
  dateTime: string; // ISO 8601 con zona horaria
  timeZone?: string;
};

export type CalendarEvent = {
  id: string;
  googleCalendarEmail?: string;
  status: string;
  summary?: string;
  description?: string;
  start: CalendarEventTime;
  end: CalendarEventTime;
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: { entryPointType: string; uri?: string }[];
  };
};

/**
 * Lista eventos confirmados de la agenda en un rango de tiempo dado.
 *
 * Útil para:
 *  - Calcular qué slots están ocupados (en /agenda)
 *  - Detectar nuevos eventos creados por la API (sincronizar leads, en futuro)
 */
export async function listEvents(timeMinISO: string, timeMaxISO: string): Promise<CalendarEvent[]> {
  const calendarId = await getCalendarId();
  // Keep old reservations blocking slots while their organizer is being retired.
  const legacy = await prisma.lead.findMany({
    where: {
      status: "scheduled",
      callScheduledAt: { gte: new Date() },
      googleEventId: { not: null },
      googleCalendarEmail: { not: null },
    },
    select: { googleCalendarEmail: true },
    distinct: ["googleCalendarEmail"],
  });
  const calendars = [...new Set([calendarId, ...legacy.map(l => l.googleCalendarEmail).filter((email): email is string => !!email)])];
  const groups = await Promise.all(calendars.map(async (email) => {
    const token = await getValidAccessToken({ googleEmail: email });
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        timeMin: timeMinISO, timeMax: timeMaxISO, singleEvents: "true",
        orderBy: "startTime", maxResults: "250", showDeleted: "false",
        ...(pageToken ? { pageToken } : {}),
      });
      const res = await fetch(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(email)}/events?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Calendar list events failed: ${res.status} ${await res.text()}`);
      const data = await res.json();
      events.push(...(data.items || []).map((event: CalendarEvent) => ({ ...event, googleCalendarEmail: email })));
      pageToken = data.nextPageToken;
    } while (pageToken);
    return events;
  }));
  return [...new Map(groups.flat().map(event => [event.googleCalendarEmail + ":" + event.id, event])).values()];
}

/**
 * Crea un evento en Calendar con Google Meet automático.
 *
 * La cuenta compartida seleccionada organiza el evento. sendUpdates=all
 * envía la invitación a sus asistentes.
 */
export async function createEventWithMeet(params: {
  title: string;
  description?: string;
  startISO: string;
  endISO: string;
  timeZone?: string;
  attendeeEmail: string;
  attendeeName?: string;
}): Promise<CalendarEvent & { googleCalendarEmail: string }> {
  const calendarId = await getCalendarId();
  const token = await getValidAccessToken({ googleEmail: calendarId });
  const tz = params.timeZone || "Europe/Madrid";

  // ─── Coanfitriones del equipo FisioFit ───
  // Estos miembros del equipo deben asistir a TODAS las videoconsultas como
  // organizadores. La agenda pública de Google Appointment ya los configura
  // automáticamente cuando alguien agenda desde su URL, pero la API NO lo
  // hace por nosotros — hay que añadirlos manualmente aquí.
  //
  // Si añades nuevos miembros del equipo de ventas, edita este array.
  const TEAM_COHOSTS: { email: string; name: string }[] = [
    { email: "fisiofitteam@fisiofitteam.com", name: "Ales Faus (FisioFit)" },
    { email: "miguelcastro@fisiofitteam.com", name: "Miguel Castro (FisioFit)" },
    { email: "sofiacaliz@fisiofitteam.com", name: "Sofía Cáliz (FisioFit)" },
  ];

  // El attendee principal (el lead). Asegurar que no duplicamos si el lead
  // por casualidad usara alguno de los emails del equipo.
  const leadEmailLower = params.attendeeEmail.trim().toLowerCase();
  const cohostsFiltered = TEAM_COHOSTS.filter(
    (c) => c.email.toLowerCase() !== leadEmailLower && c.email.toLowerCase() !== calendarId.toLowerCase()
  );

  const attendees = [
    { email: params.attendeeEmail, displayName: params.attendeeName },
    ...cohostsFiltered.map((c) => ({ email: c.email, displayName: c.name })),
  ];

  const body = {
    summary: params.title,
    description: params.description || "",
    start: { dateTime: params.startISO, timeZone: tz },
    end: { dateTime: params.endISO, timeZone: tz },
    attendees,
    conferenceData: {
      createRequest: {
        requestId: `fisiofit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    reminders: {
      useDefault: true,
    },
  };

  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Calendar create event failed: ${res.status} ${text}`);
  }

  return { ...await res.json(), googleCalendarEmail: calendarId };
}

/**
 * Devuelve el link de Google Meet de un evento (si existe).
 */
export function getMeetLink(event: CalendarEvent): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  const entry = event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
  return entry?.uri || null;
}

/**
 * Borra un evento del calendar y notifica a los attendees (sendUpdates=all).
 *
 * Best-effort: si el evento ya no existe o el API devuelve 404/410, no
 * lanzamos error — solo loggeamos. Otros errores HTTP se propagan.
 */
export async function deleteEvent(eventId: string, googleCalendarEmail?: string | null): Promise<void> {
  if (!eventId) return;
  const calendarId = googleCalendarEmail || await getCalendarId();
  const token = await getValidAccessToken({ googleEmail: calendarId });
  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  // 204 No Content = OK; 404/410 = ya no existe (lo damos por bueno)
  if (res.ok || res.status === 404 || res.status === 410) return;
  const text = await res.text();
  throw new Error(`Calendar delete event failed: ${res.status} ${text}`);
}
