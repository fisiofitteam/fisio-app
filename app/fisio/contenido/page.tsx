import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { ThisWeekView } from "@/components/ThisWeekView";
import { isoWeekFromDate } from "@/lib/content-templates";

export default async function ContentPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const user = (await getActiveProfessional())!;
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  // Lista de TODAS las semanas para el selector (más reciente primero)
  const allWeeks = await prisma.contentWeek.findMany({
    orderBy: [{ year: "desc" }, { weekNumber: "desc" }],
    select: { id: true, year: true, weekNumber: true, centralTheme: true, status: true, startDate: true, endDate: true },
  });

  // Lógica de selección:
  // - Si viene ?week=ID en la URL, mostrar esa
  // - Si no, mostrar la semana activa más prioritaria (producción > publishing > planning)
  // - Si no hay activas, la última cerrada
  // - Si no hay ninguna, modo "crea tu primera semana"
  const STATUS_PRIORITY: Record<string, number> = { production: 4, publishing: 3, planning: 2, closed: 1 };

  let selectedId: string | null = null;
  if (searchParams.week) {
    const exists = allWeeks.find((w) => w.id === searchParams.week);
    if (exists) selectedId = exists.id;
  }

  if (!selectedId && allWeeks.length > 0) {
    // Buscar la semana con mayor prioridad
    const sorted = [...allWeeks].sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 0;
      const pb = STATUS_PRIORITY[b.status] ?? 0;
      if (pa !== pb) return pb - pa;
      // Misma prioridad: la más cercana a hoy
      return Math.abs(Date.now() - a.startDate.getTime()) - Math.abs(Date.now() - b.startDate.getTime());
    });
    selectedId = sorted[0].id;
  }

  // Si no hay semanas, sugerencia para crear la primera
  const today = new Date();
  const { year, weekNumber } = isoWeekFromDate(today);

  if (!selectedId) {
    return (
      <main>
        <ContentNav active="this-week" />
        <ThisWeekView
          week={null}
          weekList={[]}
          weekStats={null}
          pendingMetrics={[]}
          isFallback={false}
          suggestion={{ year, weekNumber }}
        />
      </main>
    );
  }

  const week = await prisma.contentWeek.findUnique({
    where: { id: selectedId },
    include: {
      pieces: {
        orderBy: { dayOfWeek: "asc" },
        include: { supportStories: { orderBy: { order: "asc" } } },
      },
    },
  });

  if (!week) {
    redirect("/fisio/contenido");
  }

  // Calcular si esta selección es "fallback" (sólo hay cerradas y estamos mirando una)
  const hasActive = allWeeks.some((w) => w.status !== "closed");
  const isFallback = !hasActive && week.status === "closed" && !searchParams.week;

  // Piezas pendientes de métricas EN TODAS LAS SEMANAS (no solo la actual): alerta global
  // Una pieza está pendiente si está publicada y no tiene metricsFilledAt, y la publicación ya hace al menos 5 días
  const reminderThresholdDays = 5;
  const reminderCutoff = new Date();
  reminderCutoff.setDate(reminderCutoff.getDate() - reminderThresholdDays);

  const pendingMetricsPieces = await prisma.contentPiece.findMany({
    where: {
      status: "published",
      metricsFilledAt: null,
      scheduledAt: { lte: reminderCutoff },
    },
    include: { week: { select: { id: true, year: true, weekNumber: true, centralTheme: true } } },
    orderBy: { scheduledAt: "asc" },
  });

  // Stats agregadas de esta semana (para mostrar contexto al cerrar)
  const weekStats = (() => {
    const totals = { reach: 0, saves: 0, shares: 0, comments: 0, dmKeyword: 0, conversions: 0 };
    let piecesPublished = 0;
    let piecesWithoutMetrics = 0;
    for (const p of week.pieces) {
      if (p.status === "published") {
        piecesPublished++;
        if (!p.metricsFilledAt) piecesWithoutMetrics++;
      }
      totals.reach += p.metricsReach ?? 0;
      totals.saves += p.metricsSaves ?? 0;
      totals.shares += p.metricsShares ?? 0;
      totals.comments += p.metricsComments ?? 0;
      totals.dmKeyword += p.metricsDmKeyword ?? 0;
      totals.conversions += p.metricsConversions ?? 0;
    }
    let kpiActual: number | null = null;
    if (week.kpiName) {
      const name = week.kpiName.toLowerCase();
      if (name.includes("dm")) kpiActual = totals.dmKeyword;
      else if (name.includes("alcance")) kpiActual = totals.reach;
      else if (name.includes("guardad")) kpiActual = totals.saves;
      else if (name.includes("conversion") || name.includes("venta")) kpiActual = totals.conversions;
      else if (name.includes("compart")) kpiActual = totals.shares;
      else if (name.includes("comentario")) kpiActual = totals.comments;
    }
    return { totals, piecesPublished, piecesWithoutMetrics, kpiActual };
  })();

  return (
    <main>
      <ContentNav active="this-week" />
      <ThisWeekView
        week={{
          id: week.id,
          year: week.year,
          weekNumber: week.weekNumber,
          startDate: week.startDate.toISOString(),
          endDate: week.endDate.toISOString(),
          centralTheme: week.centralTheme,
          bodyZone: week.bodyZone,
          weekType: week.weekType,
          leadMagnetName: week.leadMagnetName,
          leadMagnetKeyword: week.leadMagnetKeyword,
          kpiName: week.kpiName,
          kpiTarget: week.kpiTarget,
          status: week.status,
          closingNotes: week.closingNotes,
          winningHooks: week.winningHooks,
          ideasEmerged: week.ideasEmerged,
          pieces: week.pieces.map((p) => ({
            id: p.id,
            dayOfWeek: p.dayOfWeek,
            format: p.format,
            status: p.status,
            scheduledAt: p.scheduledAt?.toISOString() ?? null,
            hook: p.hook,
            storiesCount: p.supportStories.length,
            storiesDone: p.supportStories.filter((s) => s.published).length,
            metricsFilledAt: p.metricsFilledAt?.toISOString() ?? null,
          })),
        }}
        weekStats={weekStats}
        pendingMetrics={pendingMetricsPieces.map((p) => ({
          id: p.id,
          dayOfWeek: p.dayOfWeek,
          format: p.format,
          scheduledAt: p.scheduledAt?.toISOString() ?? null,
          weekTheme: p.week.centralTheme,
          weekNumber: p.week.weekNumber,
          weekYear: p.week.year,
        }))}
        weekList={allWeeks.map((w) => ({
          id: w.id,
          year: w.year,
          weekNumber: w.weekNumber,
          centralTheme: w.centralTheme,
          status: w.status,
          startDate: w.startDate.toISOString(),
          endDate: w.endDate.toISOString(),
        }))}
        isFallback={isFallback}
        suggestion={{ year, weekNumber }}
      />
    </main>
  );
}
