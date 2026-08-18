/**
 * Google Calendar FreeBusy API.
 *
 * Consulta el calendario del fisio y devuelve los tramos OCUPADOS en la
 * ventana pedida. La landing de reserva resta esos tramos de la plantilla
 * horaria del fisio (ProfessionalCallAvailability) para calcular slots libres.
 *
 * Endpoint: POST https://www.googleapis.com/calendar/v3/freeBusy
 *   Body: { timeMin, timeMax, items: [{ id: "primary" }] }
 */
import { getValidAccessToken } from "@/lib/googleCalendar";

const FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";

export type BusyBlock = { start: Date; end: Date };

/**
 * Devuelve los tramos ocupados del calendario del fisio (todos los calendarios
 * que Google entienda como suyos usando "primary"). Ventana [from, to).
 */
export async function fetchBusyBlocks(input: {
  professionalId: string;
  from: Date;
  to: Date;
}): Promise<BusyBlock[]> {
  const token = await getValidAccessToken({ professionalId: input.professionalId });
  const res = await fetch(FREEBUSY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      timeMin: input.from.toISOString(),
      timeMax: input.to.toISOString(),
      items: [{ id: "primary" }],
    }),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`FreeBusy ${res.status}: ${data?.error?.message ?? "unknown"}`);
  }
  const busy = data?.calendars?.primary?.busy ?? [];
  return busy.map((b: any) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));
}
