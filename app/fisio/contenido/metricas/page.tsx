import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { MetricsView } from "@/components/MetricsView";

type Range = "week" | "month" | "quarter" | "custom";

function rangeBounds(range: Range, from?: string, to?: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  if (range === "custom" && from && to) {
    const s = new Date(from); s.setHours(0, 0, 0, 0);
    const e = new Date(to); e.setHours(23, 59, 59, 999);
    const fmt = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
    return { start: s, end: e, label: `${fmt(s)} → ${fmt(e)}` };
  }
  if (range === "week") {
    // ISO week actual: lunes 00:00 → domingo 23:59
    const t = new Date(now);
    t.setHours(0, 0, 0, 0);
    const dow = t.getDay() === 0 ? 7 : t.getDay();
    const monday = new Date(t);
    monday.setDate(t.getDate() - (dow - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday, label: "Esta semana" };
  }
  if (range === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end, label: "Este mes" };
  }
  // quarter = últimos 3 meses
  const start = new Date(now);
  start.setMonth(now.getMonth() - 3);
  start.setHours(0, 0, 0, 0);
  return { start, end: now, label: "Últimos 3 meses" };
}

function prevRangeBounds(start: Date, end: Date): { start: Date; end: Date } {
  const span = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - span);
  return { start: prevStart, end: prevEnd };
}

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string; zone?: string; type?: string; formats?: string };
}) {
  const user = (await getActiveProfessional())!;
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  const range = (["week", "month", "quarter", "custom"].includes(searchParams.range ?? "")
    ? searchParams.range
    : "month") as Range;
  const { start, end, label } = rangeBounds(range, searchParams.from, searchParams.to);
  const { start: prevStart, end: prevEnd } = prevRangeBounds(start, end);

  const zoneFilter = searchParams.zone || "all";
  const typeFilter = searchParams.type || "all";
  const formatsFilter = searchParams.formats ? searchParams.formats.split(",") : [];

  // Pieces filtrados (publicadas dentro del rango, con métricas)
  const weeksWhere: any = {};
  if (zoneFilter !== "all") weeksWhere.bodyZone = zoneFilter;
  if (typeFilter !== "all") weeksWhere.weekType = typeFilter;

  const piecesWhere: any = {
    status: "published",
    week: weeksWhere,
  };
  if (formatsFilter.length > 0) piecesWhere.format = { in: formatsFilter };

  const [piecesCurrent, piecesPrev, allWeeksInRange, leadMagnets] = await Promise.all([
    prisma.contentPiece.findMany({
      where: piecesWhere,
      include: { week: { select: { id: true, year: true, weekNumber: true, centralTheme: true, bodyZone: true, weekType: true, kpiName: true, kpiTarget: true, startDate: true } } },
    }),
    prisma.contentPiece.findMany({
      where: {
        status: "published",
        week: weeksWhere,
        ...(formatsFilter.length > 0 ? { format: { in: formatsFilter } } : {}),
      },
      include: { week: { select: { id: true, year: true, weekNumber: true, centralTheme: true, bodyZone: true, weekType: true, kpiName: true, kpiTarget: true, startDate: true } } },
    }),
    prisma.contentWeek.findMany({
      where: {
        ...weeksWhere,
        startDate: { lte: end },
        endDate: { gte: start },
      },
      include: { pieces: true },
      orderBy: [{ year: "desc" }, { weekNumber: "desc" }],
    }),
    prisma.leadMagnet.findMany({ orderBy: [{ active: "desc" }, { lastPromotedAt: "desc" }] }),
  ]);

  // Filtrar por fecha en JS (la fecha real se deriva de week.startDate + dayOfWeek - 1)
  function publishDateOf(p: { dayOfWeek: number; week: { startDate: Date } }): Date {
    const d = new Date(p.week.startDate);
    d.setUTCDate(d.getUTCDate() + (p.dayOfWeek - 1));
    return d;
  }
  const piecesCurrentFiltered = piecesCurrent.filter((p) => {
    const d = publishDateOf(p).getTime();
    return d >= start.getTime() && d <= end.getTime();
  });
  const piecesPrevFiltered = piecesPrev.filter((p) => {
    const d = publishDateOf(p).getTime();
    return d >= prevStart.getTime() && d <= prevEnd.getTime();
  });

  // === Agregados período actual vs período anterior ===
  function aggregate(pieces: typeof piecesCurrentFiltered) {
    return pieces.reduce((acc, p) => {
      acc.reach += p.metricsReach ?? 0;
      acc.saves += p.metricsSaves ?? 0;
      acc.shares += p.metricsShares ?? 0;
      acc.comments += p.metricsComments ?? 0;
      acc.dmKeyword += p.metricsDmKeyword ?? 0;
      acc.conversions += p.metricsConversions ?? 0;
      return acc;
    }, { reach: 0, saves: 0, shares: 0, comments: 0, dmKeyword: 0, conversions: 0 });
  }
  const currentTotals = aggregate(piecesCurrentFiltered);
  const prevTotals = aggregate(piecesPrevFiltered);

  function delta(curr: number, prev: number): number | null {
    if (prev === 0) return curr > 0 ? null : null; // sin base de comparación
    return Math.round(((curr - prev) / prev) * 100);
  }

  const deltas = {
    reach: delta(currentTotals.reach, prevTotals.reach),
    saves: delta(currentTotals.saves, prevTotals.saves),
    shares: delta(currentTotals.shares, prevTotals.shares),
    comments: delta(currentTotals.comments, prevTotals.comments),
    dmKeyword: delta(currentTotals.dmKeyword, prevTotals.dmKeyword),
    conversions: delta(currentTotals.conversions, prevTotals.conversions),
  };

  // === Rendimiento por formato ===
  const formatStats: Record<string, { count: number; reach: number; saves: number; comments: number; dmKeyword: number; conversions: number }> = {};
  for (const p of piecesCurrent) {
    if (!formatStats[p.format]) formatStats[p.format] = { count: 0, reach: 0, saves: 0, comments: 0, dmKeyword: 0, conversions: 0 };
    const s = formatStats[p.format];
    s.count++;
    s.reach += p.metricsReach ?? 0;
    s.saves += p.metricsSaves ?? 0;
    s.comments += p.metricsComments ?? 0;
    s.dmKeyword += p.metricsDmKeyword ?? 0;
    s.conversions += p.metricsConversions ?? 0;
  }
  const formatRows = Object.entries(formatStats).map(([format, s]) => ({
    format,
    count: s.count,
    avgReach: s.count > 0 ? Math.round(s.reach / s.count) : 0,
    avgSaves: s.count > 0 ? Math.round(s.saves / s.count) : 0,
    avgComments: s.count > 0 ? Math.round(s.comments / s.count) : 0,
    avgDmKeyword: s.count > 0 ? Math.round(s.dmKeyword / s.count) : 0,
    avgConversions: s.count > 0 ? Math.round((s.conversions / s.count) * 10) / 10 : 0,
  })).sort((a, b) => b.avgDmKeyword - a.avgDmKeyword);

  // === Rendimiento por zona ===
  const zoneStats: Record<string, { count: number; reach: number; saves: number; dmKeyword: number; conversions: number }> = {};
  for (const p of piecesCurrent) {
    const z = p.week.bodyZone;
    if (!zoneStats[z]) zoneStats[z] = { count: 0, reach: 0, saves: 0, dmKeyword: 0, conversions: 0 };
    const s = zoneStats[z];
    s.count++;
    s.reach += p.metricsReach ?? 0;
    s.saves += p.metricsSaves ?? 0;
    s.dmKeyword += p.metricsDmKeyword ?? 0;
    s.conversions += p.metricsConversions ?? 0;
  }
  const zoneRows = Object.entries(zoneStats).map(([zone, s]) => ({
    zone,
    count: s.count,
    avgReach: s.count > 0 ? Math.round(s.reach / s.count) : 0,
    avgSaves: s.count > 0 ? Math.round(s.saves / s.count) : 0,
    totalDmKeyword: s.dmKeyword,
    totalConversions: s.conversions,
  }));

  // === Ranking hooks ganadores del período ===
  // Score combinado: reach * 0.3 + saves * 0.3 + dmKeyword * 50 (DMs pesan más)
  function hookScore(p: typeof piecesCurrent[number]): number {
    return (p.metricsReach ?? 0) * 0.3 + (p.metricsSaves ?? 0) * 0.3 + (p.metricsDmKeyword ?? 0) * 50;
  }
  const topHooks = piecesCurrent
    .filter((p) => p.hook)
    .map((p) => ({
      pieceId: p.id,
      hook: p.hook!,
      format: p.format,
      bodyZone: p.week.bodyZone,
      weekTheme: p.week.centralTheme,
      reach: p.metricsReach,
      saves: p.metricsSaves,
      dmKeyword: p.metricsDmKeyword,
      conversions: p.metricsConversions,
      score: Math.round(hookScore(p)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // === Lead magnets: stats por uso en semanas ===
  const lmRows = leadMagnets.map((lm) => ({
    id: lm.id,
    name: lm.name,
    keyword: lm.keyword,
    active: lm.active,
    lastPromotedAt: lm.lastPromotedAt?.toISOString() ?? null,
  }));

  // === Comparativa semana a semana ===
  const weeklyComparison = allWeeksInRange.map((w) => {
    const totals = w.pieces.reduce((acc, p) => {
      acc.reach += p.metricsReach ?? 0;
      acc.saves += p.metricsSaves ?? 0;
      acc.dmKeyword += p.metricsDmKeyword ?? 0;
      acc.conversions += p.metricsConversions ?? 0;
      return acc;
    }, { reach: 0, saves: 0, dmKeyword: 0, conversions: 0 });

    let kpiActual: number | null = null;
    if (w.kpiName) {
      const name = w.kpiName.toLowerCase();
      if (name.includes("dm")) kpiActual = totals.dmKeyword;
      else if (name.includes("alcance")) kpiActual = totals.reach;
      else if (name.includes("guardad")) kpiActual = totals.saves;
      else if (name.includes("conversion") || name.includes("venta")) kpiActual = totals.conversions;
    }

    let kpiStatus: "above" | "met" | "below" | "unknown" = "unknown";
    if (w.kpiTarget != null && kpiActual != null) {
      if (kpiActual >= w.kpiTarget * 1.1) kpiStatus = "above";
      else if (kpiActual >= w.kpiTarget) kpiStatus = "met";
      else kpiStatus = "below";
    }

    return {
      id: w.id,
      label: `W${w.weekNumber}/${w.year}`,
      theme: w.centralTheme,
      weekType: w.weekType,
      kpiName: w.kpiName,
      kpiTarget: w.kpiTarget,
      kpiActual,
      kpiStatus,
    };
  });

  return (
    <main>
      <ContentNav active="metrics" role={user.role} />

      {/* Enlace externo a la app de estadísticas de reels (proyecto reel-stats).
          Se abre en pestaña nueva porque es otra app deployada aparte. */}
      <a
        href="https://reel-stats-kappa.vercel.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="block mb-4 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 hover:border-neutral-300 transition-colors p-3"
      >
        <div className="flex items-center gap-3">
          <div className="text-2xl">📊</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Reels Stats · Análisis de temas y engagement</div>
            <div className="text-xs text-neutral-500">
              Panel externo con métricas y análisis IA de los reels de @fisiofitcross · Se abre en pestaña nueva ↗
            </div>
          </div>
        </div>
      </a>

      <MetricsView
        range={range}
        rangeLabel={label}
        from={searchParams.from ?? ""}
        to={searchParams.to ?? ""}
        zoneFilter={zoneFilter}
        typeFilter={typeFilter}
        formatsFilter={formatsFilter}
        totals={currentTotals}
        deltas={deltas}
        piecesCount={piecesCurrent.length}
        formatRows={formatRows}
        zoneRows={zoneRows}
        topHooks={topHooks}
        leadMagnets={lmRows}
        weeklyComparison={weeklyComparison}
      />
    </main>
  );
}
