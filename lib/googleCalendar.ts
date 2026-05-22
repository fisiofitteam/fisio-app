/**
 * Helpers de alto nivel para interactuar con Google Calendar.
 *
 * Centraliza la gestión del access_token (refresca automáticamente cuando
 * expira) y proporciona métodos sencillos para leer y crear eventos en la
 * agenda compartida `videoconsultas@fisiofitteam.com`.
 */
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { refreshAccessToken } from "@/lib/googleOAuth";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

// Margen de seguridad: si el token expira en menos de 60s, lo refrescamos.
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/**
 * Obtiene un access_token válido (refresca si expiró) de la primera
 * conexión Google guardada en BD.
 *
 * Lanza un error si no hay conexión activa (la app no está conectada).
 */
export async function getValidAccessToken(): Promise<string> {
  const conn = await prisma.googleCalendarConnection.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!conn) {
    throw new Error("No hay Google Calendar conectado. Conéctalo en Ajustes → Integraciones.");
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

/**
 * El email de la agenda donde leemos/escribimos. Usamos "primary" del usuario
 * que se conectó (que debería ser videoconsultas@fisiofitteam.com).
 */
async function getCalendarId(): Promise<string> {
  const conn = await prisma.googleCalendarConnection.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!conn) throw new Error("No hay conexión Google");
  return conn.googleEmail;
}

type CalendarEventTime = {
  dateTime: string; // ISO 8601 con zona horaria
  timeZone?: string;
};

export type CalendarEvent = {
  id: string;
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
  const token = await getValidAccessToken();
  const calendarId = await getCalendarId();

  const params = new URLSearchParams({
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    showDeleted: "false",
  });

  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Calendar list events failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return (data.items || []) as CalendarEvent[];
}

/**
 * Crea un evento en Calendar con Google Meet automático.
 *
 * Notas:
 *  - El evento se crea en la agenda `videoconsultas@` (mismo calendar al que
 *    estamos conectados via OAuth)
 *  - Como esa agenda ya tiene configurado a fisiofitteam@ y miguelcastro@
 *    como coanfitriones automáticos en cada evento, NO los pasamos en
 *    attendees aquí (Google los añadirá por su cuenta)
 *  - sendUpdates=all hace que Google envíe el email de invitación al asistente
 */
export async function createEventWithMeet(params: {
  title: string;
  description?: string;
  startISO: string;
  endISO: string;
  timeZone?: string;
  attendeeEmail: string;
  attendeeName?: string;
}): Promise<CalendarEvent> {
  const token = await getValidAccessToken();
  const calendarId = await getCalendarId();
  const tz = params.timeZone || "Europe/Madrid";

  const body = {
    summary: params.title,
    description: params.description || "",
    start: { dateTime: params.startISO, timeZone: tz },
    end: { dateTime: params.endISO, timeZone: tz },
    attendees: [
      { email: params.attendeeEmail, displayName: params.attendeeName },
    ],
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

  return res.json();
}

/**
 * Devuelve el link de Google Meet de un evento (si existe).
 */
export function getMeetLink(event: CalendarEvent): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  const entry = event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
  return entry?.uri || null;
}
