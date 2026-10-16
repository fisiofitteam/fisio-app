/**
 * GET /api/team-satisfaction?from=&to=&metric=satisfaction|nps&fisioId=
 *
 * Devuelve el detalle individual de las respuestas que alimentan los
 * KPIs "Satisfacción media" y "NPS medio del equipo" del panel de
 * métricas (ver TeamMetricsBlock).
 *
 * Cada fila lleva paciente + fisio asignado + score + fecha, para que
 * el modal de "ver detalle" muestre quién respondió qué y, en el caso
 * del NPS/satisfacción con el equipo, qué fisio tenía asignado.
 *
 * Filtros opcionales:
 *   - metric: "satisfaction" (default) | "nps". Filtra por score no nulo.
 *   - fisioId: restringe a los pacientes asignados a ese fisio.
 *
 * Solo CEO / head_success.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "head_success";
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = req.nextUrl;
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const metric = url.searchParams.get("metric") === "nps" ? "nps" : "satisfaction";
  const fisioIdFilter = url.searchParams.get("fisioId") || null;

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: "from y to requeridos (YYYY-MM-DD)" }, { status: 400 });
  }
  const from = new Date(fromParam + "T00:00:00Z");
  const to = new Date(toParam + "T23:59:59Z");

  const where: any = {
    submittedAt: { gte: from, lte: to },
  };
  if (metric === "nps") where.npsScore = { not: null };
  else where.satisfactionScore = { not: null };

  const rows = await prisma.patientCallFormResponse.findMany({
    where,
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      patientId: true,
      professionalId: true,
      submittedAt: true,
      satisfactionScore: true,
      npsScore: true,
    },
  });

  // JOIN manual (PatientCallFormResponse no tiene relación `.patient`
  // en el schema, solo `patientId` denormalizado). Pedimos los pacientes
  // en un único query y los indexamos.
  const patientIds = Array.from(new Set(rows.map((r) => r.patientId)));
  const patients = await prisma.patient.findMany({
    where: { id: { in: patientIds } },
    select: {
      id: true,
      fullName: true,
      programType: true,
      assignedProfessional: { select: { id: true, fullName: true } },
    },
  });
  const patientById = new Map(patients.map((p) => [p.id, p]));

  // Filtro por fisio asignado al paciente (es lo semánticamente útil
  // para "satisfacción con MI fisio"; ignoramos professionalId que
  // apunta al closer/head que llevó la llamada previa).
  const filtered = fisioIdFilter
    ? rows.filter((r) => patientById.get(r.patientId)?.assignedProfessional?.id === fisioIdFilter)
    : rows;

  const details = filtered.map((r) => {
    const p = patientById.get(r.patientId);
    return {
      id: r.id,
      patientId: r.patientId,
      patientName: p?.fullName ?? "—",
      programType: p?.programType ?? null,
      assignedFisio: p?.assignedProfessional
        ? { id: p.assignedProfessional.id, fullName: p.assignedProfessional.fullName }
        : null,
      score: metric === "nps" ? r.npsScore : r.satisfactionScore,
      submittedAt: r.submittedAt.toISOString(),
    };
  });

  return NextResponse.json({ metric, count: details.length, details });
}
