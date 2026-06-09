import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { CalendarView } from "@/components/CalendarView";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { view?: string; month?: string; year?: string; zone?: string; type?: string };
}) {
  const user = (await getActiveProfessional())!;
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  const view = searchParams.view === "table" ? "table" : "month";
  const today = new Date();
  const month = Number(searchParams.month) || (today.getMonth() + 1);
  const year = Number(searchParams.year) || today.getFullYear();
  const zoneFilter = searchParams.zone || "all";
  const typeFilter = searchParams.type || "all";

  // Filtros base
  const where: any = {};
  if (zoneFilter !== "all") where.bodyZone = zoneFilter;
  if (typeFilter !== "all") where.weekType = typeFilter;

  // Rango de eventos ampliado: mes mostrado +/- 2 meses, así el cliente
  // tiene datos listos al auto-avanzar meses mientras arrastra una pieza.
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const rangeStart = new Date(Date.UTC(year, month - 3, 1));
  const rangeEnd = new Date(Date.UTC(year, month + 2, 0, 23, 59, 59));

  const [weeks, events] = await Promise.all([
    prisma.contentWeek.findMany({
      where,
      orderBy: [{ year: "desc" }, { weekNumber: "desc" }],
      include: {
        pieces: {
          select: { id: true, dayOfWeek: true, format: true, title: true, goals: true, status: true, hook: true },
          orderBy: { dayOfWeek: "asc" },
        },
      },
    }),
    prisma.calendarEvent.findMany({
      where: { date: { gte: rangeStart, lte: rangeEnd } },
      orderBy: { date: "asc" },
    }),
  ]);

  return (
    <main>
      <ContentNav active="calendar" role={user.role} />
      <CalendarView
        view={view}
        month={month}
        year={year}
        zoneFilter={zoneFilter}
        typeFilter={typeFilter}
        weeks={weeks.map((w) => ({
          id: w.id,
          year: w.year,
          weekNumber: w.weekNumber,
          startDate: w.startDate.toISOString(),
          endDate: w.endDate.toISOString(),
          centralTheme: w.centralTheme,
          bodyZone: w.bodyZone,
          weekType: w.weekType,
          leadMagnetName: w.leadMagnetName,
          leadMagnetKeyword: w.leadMagnetKeyword,
          status: w.status,
          pieces: w.pieces.map((p) => ({
            id: p.id,
            dayOfWeek: p.dayOfWeek,
            format: p.format,
            title: p.title,
            goals: p.goals,
            status: p.status,
            hook: p.hook,
          })),
        }))}
        events={events.map((e) => ({
          id: e.id,
          date: e.date.toISOString(),
          title: e.title,
          notes: e.notes,
          color: e.color,
        }))}
      />
    </main>
  );
}
