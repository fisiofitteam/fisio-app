import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getAvailableSlots } from "@/lib/agendaSlots";
import { TeamCalendarView, type CalendarEventItem } from "@/components/TeamCalendarView";

export const dynamic = "force-dynamic";

// Devuelve el lunes 00:00 (hora local) de la semana de la fecha dada.
function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay() === 0 ? 7 : d.getDay(); // 1=Lun..7=Dom
  d.setDate(d.getDate() - (dow - 1));
  return d;
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: { w?: string };
}) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  // Lunes de la semana visible (param ?w=YYYY-MM-DD o esta semana)
  let weekStart: Date;
  if (searchParams.w) {
    const d = new Date(searchParams.w + "T00:00:00");
    weekStart = isNaN(d.getTime()) ? mondayOf(new Date()) : mondayOf(d);
  } else {
    weekStart = mondayOf(new Date());
  }
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // ── Permisos por rol ────────────────────────────────────────────────────
  // Llamadas comerciales: closer ve solo las suyas; setter/CEO/head_success las
  // ven todas; fisio no las ve. Huecos: solo setter/CEO/head_success.
  const isManager = user.role === "ceo" || user.role === "head_success";
  const seesAllCalls = isManager || user.role === "setter";
  const seesOwnCalls = user.role === "closer";
  const seesSlots = isManager || user.role === "setter";

  // ── Llamadas ────────────────────────────────────────────────────────────
  let calls: any[] = [];
  if (seesAllCalls || seesOwnCalls) {
    calls = await prisma.lead.findMany({
      where: {
        callScheduledAt: { gte: weekStart, lt: weekEnd },
        status: { in: ["scheduled", "won", "lost", "no_show"] },
        ...(seesOwnCalls ? { closerId: user.id } : {}),
      },
      select: {
        id: true, fullName: true, callScheduledAt: true, status: true,
        closer: { select: { id: true, fullName: true } },
      },
      orderBy: { callScheduledAt: "asc" },
    });
  }

  // ── Reuniones internas (CalendarEvent) ──────────────────────────────────
  const meetings = await prisma.calendarEvent.findMany({
    where: { date: { gte: weekStart, lt: weekEnd } },
    orderBy: { date: "asc" },
  });

  // ── Vacaciones / ausencias (que solapen con la semana) ──────────────────
  const leaves = await prisma.professionalLeave.findMany({
    where: {
      status: { in: ["scheduled", "applied"] },
      startDate: { lt: weekEnd },
      endDate: { gte: weekStart },
    },
    include: { professional: { select: { id: true, fullName: true } } },
    orderBy: { startDate: "asc" },
  });

  // ── Huecos públicos de agenda (solo setter/managers) ────────────────────
  let slotsThisWeek: { startISO: string; endISO: string }[] = [];
  if (seesSlots) {
    try {
      const all = await getAvailableSlots();
      slotsThisWeek = all
        .filter((s) => {
          const t = new Date(s.startISO).getTime();
          return t >= weekStart.getTime() && t < weekEnd.getTime();
        })
        .map((s) => ({ startISO: s.startISO, endISO: s.endISO }));
    } catch {
      slotsThisWeek = [];
    }
  }

  // ── Unificar todos los eventos en una lista común para el cliente ──────
  const events: CalendarEventItem[] = [];

  // Llamadas
  for (const c of calls) {
    const start = c.callScheduledAt as Date;
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 1h por defecto
    events.push({
      id: `call-${c.id}`,
      kind: "call",
      title: c.fullName,
      subtitle: c.closer ? `📞 ${c.closer.fullName.split(" ")[0]}` : "📞 sin closer",
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      color: c.status === "won" ? "emerald" : c.status === "lost" ? "rose" : c.status === "no_show" ? "neutral" : "purple",
      href: "/fisio/llamadas-venta",
    });
  }

  // Reuniones
  for (const m of meetings) {
    const start = m.date as Date;
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    events.push({
      id: `meeting-${m.id}`,
      kind: "meeting",
      title: m.title,
      subtitle: m.notes ?? "",
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      color: (m.color || "blue") as any,
      href: "/fisio/reuniones",
    });
  }

  // Vacaciones (eventos "todo el día" para cada día solapado)
  for (const lv of leaves) {
    const lvStart = lv.startDate as Date;
    const lvEnd = lv.endDate as Date;
    // Limitar al rango de la semana visible
    const visStart = lvStart < weekStart ? weekStart : lvStart;
    const visEnd = lvEnd > weekEnd ? weekEnd : new Date(lvEnd.getTime() + 86400000); // inclusivo + 1 día
    events.push({
      id: `leave-${lv.id}`,
      kind: "leave",
      title: `🌴 Vacaciones · ${lv.professional.fullName.split(" ")[0]}`,
      subtitle: lv.notes ?? "Fuera",
      startISO: visStart.toISOString(),
      endISO: visEnd.toISOString(),
      color: "amber",
      allDay: true,
    });
  }

  // Huecos disponibles (solo si rol lo permite)
  for (const s of slotsThisWeek) {
    events.push({
      id: `slot-${s.startISO}`,
      kind: "slot",
      title: "Hueco libre",
      subtitle: "Agenda pública",
      startISO: s.startISO,
      endISO: s.endISO,
      color: "teal",
    });
  }

  return (
    <TeamCalendarView
      events={events}
      weekStartISO={weekStart.toISOString()}
      currentUserRole={user.role}
    />
  );
}
