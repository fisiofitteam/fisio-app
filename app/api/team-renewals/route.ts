/**
 * GET /api/team-renewals?from=&to=&fisioId=&outcome=
 *
 * Devuelve el detalle de renovaciones (renewed/lost) atribuidas al
 * EQUIPO en un periodo — misma lógica que `getRenewalActivityInPeriod`
 * pero enriqueciendo con nombre del paciente y del fisio asignado.
 *
 * Filtros opcionales:
 *   - fisioId: restringe a las renovaciones de un solo fisio.
 *   - outcome: "renewed" | "lost" | "all" (default all).
 *
 * Solo CEO / head_success.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getRenewalActivityInPeriod } from "@/lib/renewals";

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
  const fisioId = url.searchParams.get("fisioId");
  const outcomeFilter = url.searchParams.get("outcome") ?? "all";

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: "from y to requeridos (YYYY-MM-DD)" }, { status: 400 });
  }
  const from = new Date(fromParam + "T00:00:00Z");
  const to = new Date(toParam + "T23:59:59.999Z");
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: "Fechas invalidas" }, { status: 400 });
  }

  const opportunities = await getRenewalActivityInPeriod(from, to);

  // Filtro por fisio (si se pide).
  const filteredByFisio = fisioId
    ? opportunities.filter((o) => o.assignedProfessionalId === fisioId)
    : opportunities;

  // Filtro por outcome.
  const filtered = outcomeFilter === "all"
    ? filteredByFisio
    : filteredByFisio.filter((o) => o.outcome === outcomeFilter);

  if (filtered.length === 0) return NextResponse.json({ rows: [] });

  // Enriquecer con nombres.
  const patientIds = Array.from(new Set(filtered.map((o) => o.patientId)));
  const fisioIds = Array.from(new Set(filtered.map((o) => o.assignedProfessionalId).filter(Boolean))) as string[];

  const [patients, fisios] = await Promise.all([
    prisma.patient.findMany({
      where: { id: { in: patientIds } },
      select: { id: true, fullName: true, programType: true },
    }),
    fisioIds.length > 0
      ? prisma.professional.findMany({
          where: { id: { in: fisioIds } },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([]),
  ]);

  const patientById = new Map(patients.map((p) => [p.id, p]));
  const fisioById = new Map(fisios.map((f) => [f.id, f]));

  const rows = filtered
    .map((o) => {
      const p = patientById.get(o.patientId);
      const f = o.assignedProfessionalId ? fisioById.get(o.assignedProfessionalId) : null;
      return {
        patientId: o.patientId,
        patientName: p?.fullName ?? "(desconocido)",
        programType: p?.programType ?? null,
        fisioId: o.assignedProfessionalId,
        fisioName: f?.fullName ?? null,
        outcome: o.outcome,
        when: o.when.toISOString(),
        amountPaid: o.amountPaid,
      };
    })
    .sort((a, b) => a.when.localeCompare(b.when));

  return NextResponse.json({ rows });
}
