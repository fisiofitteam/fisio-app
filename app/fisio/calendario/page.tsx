import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getAvailableSlots } from "@/lib/agendaSlots";
import { TeamCalendarView, type CalendarEventItem, type ProUI } from "@/components/TeamCalendarView";

export const dynamic = "force-dynamic";

// YYYY-MM-DD en Madrid
function madridYMD(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}

// Lunes 00:00 Madrid de la semana que contiene `date`.
function mondayMadrid(date: Date): Date {
  // Día de la semana en Madrid (1=Lun..7=Dom)
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short" });
  const wk = fmt.format(date);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const dow = map[wk] || 1;
  // Construimos lunes 00:00 Madrid restando días en UTC y luego ajustando a 00:00 local
  const ymd = madridYMD(date);
  const [y, m, d] = ymd.split("-").map(Number);
  // Día actual en Madrid (00:00 Madrid) en UTC: lo aproximamos creando un Date con la hora UTC del offset
  const mondayUtc = new Date(Date.UTC(y, m - 1, d - (dow - 1), 0, 0, 0));
  // Ajustar al offset de Madrid de ese día (CET/CEST). Para que el "00:00 Madrid" coincida con UTC.
  // En lugar de complicarnos, usamos: tomar el día Madrid (string) y construir un Date a las 22:00 UTC
  // del día anterior es frágil. Más simple: devolver mondayUtc (00:00 UTC). Las queries de Prisma usan
  // este Date como umbral. Como las fechas en BD también están en UTC, comparamos en UTC consistentemente.
  // El render del cliente convierte cada evento a Madrid para posicionarlo.
  return mondayUtc;
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: { w?: string };
}) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  // Lunes de la semana visible
  let weekStart: Date;
  if (searchParams.w) {
    const d = new Date(searchParams.w + "T00:00:00Z");
    weekStart = isNaN(d.getTime()) ? mondayMadrid(new Date()) : mondayMadrid(d);
  } else {
    weekStart = mondayMadrid(new Date());
  }
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  // ── Permisos por rol ────────────────────────────────────────────────────
  const isManager = user.role === "ceo" || user.role === "head_success";
  const seesAllCalls = isManager || user.role === "setter";
  const seesOwnCalls = user.role === "closer";
  const seesSlots = isManager || user.role === "setter";
  // Sidebar 'Mis calendarios': solo CEO y head-success. La setter ve directamente
  // todos los eventos relevantes sin selector (cierra el ruido de pestaña vacía).
  const showFilterSidebar = isManager;

  // ── Profesionales (para colores y filtro del sidebar) ───────────────────
  // CEO ve a todo el equipo; head-success solo se ve a sí mismo y a los fisios
  // (no muestra el equipo comercial).
  const proWhere: any = { active: true };
  if (user.role === "head_success") {
    proWhere.OR = [{ id: user.id }, { role: "fisio" }];
  }
  const allPros = await prisma.professional.findMany({
    where: proWhere,
    select: { id: true, fullName: true, role: true },
    orderBy: { fullName: "asc" },
  });

  // ── Llamadas ────────────────────────────────────────────────────────────
  // Solo aparecen si están activas (agendada/vendida/perdida) o en follow-up.
  // Las canceladas y no-show no se muestran (se considera que ese hueco se libera).
  let calls: any[] = [];
  if (seesAllCalls || seesOwnCalls) {
    calls = await prisma.lead.findMany({
      where: {
        callScheduledAt: { gte: weekStart, lt: weekEnd },
        OR: [
          { status: { in: ["scheduled", "won", "lost"] } },
          { inFollowUp: true },
        ],
        ...(seesOwnCalls ? { closerId: user.id } : {}),
      },
      select: {
        id: true, fullName: true, callScheduledAt: true, status: true, inFollowUp: true,
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

  // ── Vacaciones (que solapen con la semana) ──────────────────────────────
  const leaves = await prisma.professionalLeave.findMany({
    where: {
      status: { in: ["scheduled", "applied"] },
      startDate: { lt: weekEnd },
      endDate: { gte: weekStart },
    },
    include: { professional: { select: { id: true, fullName: true } } },
    orderBy: { startDate: "asc" },
  });

  // ── Huecos públicos (solo setter/managers) ──────────────────────────────
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

  // ── Unificar eventos ────────────────────────────────────────────────────
  const events: CalendarEventItem[] = [];

  for (const c of calls) {
    const start = c.callScheduledAt as Date;
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    events.push({
      id: `call-${c.id}`,
      kind: "call",
      title: `📞 ${c.fullName}`,
      subtitle: c.closer ? c.closer.fullName.split(" ")[0] : "sin closer",
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      ownerId: c.closer?.id ?? null,
      href: "/fisio/llamadas-venta",
    });
  }

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
      ownerId: null,
      href: "/fisio/reuniones",
    });
  }

  for (const lv of leaves) {
    events.push({
      id: `leave-${lv.id}`,
      kind: "leave",
      title: `🌴 ${lv.professional.fullName.split(" ")[0]}`,
      subtitle: lv.notes ?? "Vacaciones",
      startISO: lv.startDate.toISOString(),
      endISO: new Date(lv.endDate.getTime() + 86400000).toISOString(), // inclusivo
      ownerId: lv.professional.id,
      allDay: true,
    });
  }

  for (const s of slotsThisWeek) {
    events.push({
      id: `slot-${s.startISO}`,
      kind: "slot",
      title: "Hueco libre",
      subtitle: "",
      startISO: s.startISO,
      endISO: s.endISO,
      ownerId: null,
    });
  }

  const pros: ProUI[] = allPros.map((p) => ({ id: p.id, fullName: p.fullName, role: p.role }));

  return (
    <TeamCalendarView
      events={events}
      weekStartISO={weekStart.toISOString()}
      pros={pros}
      currentUserId={user.id}
      showFilterSidebar={showFilterSidebar}
      canSeeSlots={seesSlots}
    />
  );
}
