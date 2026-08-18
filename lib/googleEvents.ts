/**
 * Google Calendar API — crear evento con Meet incluido en el calendario
 * personal del fisio.
 *
 * conferenceData con createRequest genera un link de Meet automáticamente
 * y lo devuelve en la respuesta como conferenceData.entryPoints[0].uri.
 *
 * Docs: https://developers.google.com/calendar/api/v3/reference/events/insert
 */
import { getValidAccessToken } from "@/lib/googleCalendar";

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export type CreateEventInput = {
  professionalId: string;
  summary: string;         // Título del evento en el calendar
  description?: string;
  start: Date;
  end: Date;
  attendeeEmails: string[];
  timeZone?: string;       // "Europe/Madrid" por defecto
};

export type CreatedEvent = {
  id: string;              // Google event id
  meetingUrl: string | null;
  htmlLink: string | null;
};

export async function createEventWithMeet(input: CreateEventInput): Promise<CreatedEvent> {
  const token = await getValidAccessToken({ professionalId: input.professionalId });

  const timeZone = input.timeZone ?? "Europe/Madrid";
  const body = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.start.toISOString(), timeZone },
    end: { dateTime: input.end.toISOString(), timeZone },
    attendees: input.attendeeEmails.map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    // Recordatorios estándar Google
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 60 },
        { method: "popup", minutes: 10 },
      ],
    },
  };

  const url = `${EVENTS_URL}?conferenceDataVersion=1&sendUpdates=all`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`Calendar create event ${res.status}: ${data?.error?.message ?? "unknown"}`);
  }

  const entry = data?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video");
  return {
    id: data.id,
    meetingUrl: entry?.uri ?? null,
    htmlLink: data.htmlLink ?? null,
  };
}
