import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

// POST: cerrar la semana
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { weekId, closingNotes, winningHooks, ideasEmerged } = await req.json();
  if (!weekId) return NextResponse.json({ error: "weekId requerido" }, { status: 400 });

  const week = await prisma.contentWeek.update({
    where: { id: weekId },
    data: {
      status: "closed",
      closedAt: new Date(),
      closingNotes: closingNotes || null,
      winningHooks: winningHooks || null,
      ideasEmerged: ideasEmerged || null,
    },
  });

  return NextResponse.json(week);
}

// GET: stats agregadas de la semana (totales del KPI + sumatorios)
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const weekId = req.nextUrl.searchParams.get("weekId");
  if (!weekId) return NextResponse.json({ error: "weekId requerido" }, { status: 400 });

  const week = await prisma.contentWeek.findUnique({
    where: { id: weekId },
    include: { pieces: true },
  });
  if (!week) return NextResponse.json({ error: "Week not found" }, { status: 404 });

  const totals = {
    reach: 0,
    saves: 0,
    shares: 0,
    comments: 0,
    dmKeyword: 0,
    conversions: 0,
  };
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

  // KPI: si el nombre coincide con uno de los conocidos, devolvemos el valor real
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

  return NextResponse.json({
    totals,
    piecesPublished,
    piecesWithoutMetrics,
    kpiActual,
    kpiTarget: week.kpiTarget,
    kpiName: week.kpiName,
  });
}
