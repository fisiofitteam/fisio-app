import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listEvents } from "@/lib/googleCalendar";

export const dynamic = "force-dynamic";

// CEO-only, bounded read-only diagnostics. Never infer a sale from a patient's email.
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (user?.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const now = Date.now();
  const from = new Date(req.nextUrl.searchParams.get("from") || now - 7 * 86400000);
  const to = new Date(req.nextUrl.searchParams.get("to") || now + 21 * 86400000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) ||
      to <= from || to.getTime() - from.getTime() > 31 * 86400000) {
    return NextResponse.json({ error: "Rango inválido (máximo 31 días)" }, { status: 400 });
  }
  try {
    const events = await listEvents(from.toISOString(), to.toISOString());
    const ids = [...new Set(events.map(e => e.id))];
    const [leads, patientCalls] = await Promise.all([
      prisma.lead.findMany({ where: { googleEventId: { in: ids } }, select: {
        id: true, googleEventId: true, googleCalendarEmail: true, status: true, callScheduledAt: true,
      } }),
      prisma.patientCall.findMany({ where: { googleEventId: { in: ids } }, select: {
        id: true, googleEventId: true, type: true, status: true, scheduledAt: true,
      } }),
    ]);
    return NextResponse.json({ events: events.map(event => {
      const metadata = event as typeof event & {
        iCalUID?: string; organizer?: { email?: string }; creator?: { email?: string };
        extendedProperties?: { private?: Record<string, string> };
      };
      return {
        id: event.id, calendar: event.googleCalendarEmail, title: event.summary,
        start: event.start, end: event.end, status: event.status,
        iCalUID: metadata.iCalUID, organizer: metadata.organizer?.email,
        creator: metadata.creator?.email,
        leads: leads.filter(l => l.googleEventId === event.id),
        patientCalls: patientCalls.filter(c => c.googleEventId === event.id),
      };
    }) });
  } catch {
    return NextResponse.json({ error: "No se pudo consultar Google Calendar" }, { status: 502 });
  }
}
