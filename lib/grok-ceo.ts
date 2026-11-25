import { prisma } from "@/lib/prisma";
import { calculateSalesMetrics, calculateLeadOriginMetrics } from "@/lib/sales";
import { calculateFinanceSummary } from "@/lib/finance";
import { getRenewalActivityInPeriod } from "@/lib/renewals";
import { computeCapacityReport } from "@/lib/capacity";
import { activePatientCondition } from "@/lib/patient-active";
import { completeWindow, numericFields, madridDay } from "@/lib/grok-ceo-contract";

export async function collectGrokPeriod(days: number, back = 0, now = new Date()) {
  const { start, end } = completeWindow(days, back, now);
  const [sales, leadOrigin, finance, renewals, leadsCreated] = await Promise.all([
    calculateSalesMetrics(start, end),
    calculateLeadOriginMetrics(start, end),
    calculateFinanceSummary(start, end),
    getRenewalActivityInPeriod(start, end),
    prisma.lead.count({ where: { createdAt: { gte: start, lte: end } } }),
  ]);
  const renewed = renewals.filter(r => r.outcome === "renewed").length;
  const lost = renewals.filter(r => r.outcome === "lost").length;
  return {
    start: start.toISOString(), end: end.toISOString(),
    leadsCreated,
    sales: numericFields(sales, ["scheduled","won","lost","cancelled","no_show","closeRate","showUpRate","revenue","ticketAvg"]),
    leadOrigin: numericFields(leadOrigin, ["aiCount","setterCount","total","aiCloseRate","setterCloseRate","aiNoShowRate","setterNoShowRate"]),
    finance: numericFields(finance, ["income","expense","profit","profitPct","billed","incomeNew","incomeRenewal","incomeOther","billedNew","billedRenewal"]),
    renewals: { renewed, lost, renewalRate: renewed + lost ? Math.round(100 * renewed / (renewed + lost)) : null },
  };
}
export async function collectGrokSnapshot(now = new Date()) {
  const [yesterday, last7, previous7, last30, previous30, capacity, activeClients, historyRows] = await Promise.all([
    collectGrokPeriod(1, 0, now), collectGrokPeriod(7, 0, now), collectGrokPeriod(7, 7, now),
    collectGrokPeriod(30, 0, now), collectGrokPeriod(30, 30, now),
    computeCapacityReport(), prisma.patient.count({ where: { isTest: false, ...activePatientCondition() } }),
    prisma.ceoReport.findMany({ where: { periodType: "grok_daily", id: { lt: "grok-ceo-" + madridDay(now) } }, orderBy: { id: "desc" }, take: 7, select: { id: true, narrative: true } }),
  ]);
  return {
    version: 1, reportDay: madridDay(now), generatedAt: now.toISOString(), timezone: "Europe/Madrid",
    yesterday, last7, previous7, last30, previous30, activeClients,
    capacity: numericFields(capacity.summary, ["coaches","assigned","active","paused","capacityTotal","freeTotal","renewsSoonTotal","expectedRenewTotal","saturatedCoaches"]),
    history: historyRows.flatMap(row => {
      try { const n = JSON.parse(row.narrative); return [{ day: row.id.slice(9), actions: n.accionesRecomendadas, decisions: n.decisionesFounder, summary: n.resumenEjecutivo }]; } catch { return []; }
    }),
    definitions: {
      leadsCreated: "Registros CRM creados; no equivale a contactos únicos ni todos los leads de marketing.",
      sales: "Citas por fecha agendada; resultados por fecha de decisión; cierre sobre won+lost; asistencia sobre won+lost+no_show.",
      leadOrigin: "Cohorte por fecha de cita; no mezclar con resultados por fecha de decisión.",
      finance: "income=cobrado, billed=facturado, profit=resultado de caja del periodo; no equivale a saldo bancario.",
      capacity: "Resumen actual del equipo; activeClients incluye activos no asignados.",
      missing: "No disponibles todavía: saldo bancario, runway, impagos vencidos conciliados, satisfacción y leads cualificados. No inferirlos ni tratarlos como cero.",
    },
  };
}
