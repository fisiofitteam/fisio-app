/**
 * Generador de Informes CEO.
 *
 * Recopila las metricas de negocio del periodo (sales, lead-origin,
 * renovaciones, finanzas, skalex) usando los helpers ya existentes, y
 * pide a Sonnet 4.6 que teje una narrativa ejecutiva. NO calcula
 * numeros — todos los cardinales van pre-calculados en el JSON; la IA
 * solo interpreta.
 *
 * Se persiste en CeoReport para llevar historico. Al generar un nuevo
 * informe pasamos los N previos del mismo periodType a la IA para que
 * pueda comparar tendencias ("frente a la semana pasada X ha subido…").
 */
import { prisma } from "@/lib/prisma";
import { calculateSalesMetrics, calculateLeadOriginMetrics, type SalesMetrics, type LeadOriginMetrics } from "@/lib/sales";
import { getRenewalActivityInPeriod, type RenewalActivityRow } from "@/lib/renewals";
import { calculateFinanceSummary, type FinanceSummary } from "@/lib/finance";
import { getSkalexMonthlyMetrics, type SkalexMonthlyMetrics } from "@/lib/skalex/metrics";

const MODEL_SONNET = "claude-sonnet-4-6";

export type CeoPeriodType = "week" | "month" | "quarter" | "custom";

export type CeoMetricsSnapshot = {
  period: {
    type: CeoPeriodType;
    start: string; // ISO
    end: string;
    label: string;
    days: number;
  };
  sales: SalesMetrics;
  leadOrigin: LeadOriginMetrics;
  renewals: {
    renewed: number;
    lost: number;
    renewalRate: number | null; // renewed / (renewed + lost) %
    revenueRenewed: number;
    detail: Array<{
      patientId: string;
      outcome: "renewed" | "lost";
      when: string;
      amountPaid: number | null;
    }>;
  };
  finance: FinanceSummary;
  skalex: {
    activeConversations: number;
    linkedToPatient: number;
    linkedToLeadOnly: number;
    unlinked: number;
    conversionToLead: number | null; // linkedToLeadOnly+linkedToPatient / active %
    topLabels: Array<{ name: string; count: number }>;
    phases: Array<{ phase: number | null; phaseName: string | null; count: number }>;
  };
};

// ─────────────────────── Recolector ───────────────────────

export async function collectCeoMetrics(period: {
  type: CeoPeriodType;
  start: Date;
  end: Date;
  label: string;
}): Promise<CeoMetricsSnapshot> {
  const [sales, leadOrigin, renewalActivity, finance, skalex] = await Promise.all([
    calculateSalesMetrics(period.start, period.end),
    calculateLeadOriginMetrics(period.start, period.end),
    getRenewalActivityInPeriod(period.start, period.end),
    calculateFinanceSummary(period.start, period.end),
    getSkalexMonthlyMetrics(period.start, period.end),
  ]);

  const renewed = renewalActivity.filter((r) => r.outcome === "renewed").length;
  const lost = renewalActivity.filter((r) => r.outcome === "lost").length;
  const renewalRate = renewed + lost > 0 ? Math.round((renewed / (renewed + lost)) * 100) : null;
  const revenueRenewed = renewalActivity
    .filter((r) => r.outcome === "renewed" && r.amountPaid != null)
    .reduce((s, r) => s + (r.amountPaid ?? 0), 0);

  const skalexTotal = skalex.activeConversations;
  const skalexLinked = skalex.linkedToPatient + skalex.linkedToLeadOnly;
  const conversionToLead = skalexTotal > 0 ? Math.round((skalexLinked / skalexTotal) * 100) : null;

  const days = Math.max(1, Math.round((period.end.getTime() - period.start.getTime()) / 86400000));

  return {
    period: {
      type: period.type,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      label: period.label,
      days,
    },
    sales,
    leadOrigin,
    renewals: {
      renewed,
      lost,
      renewalRate,
      revenueRenewed,
      detail: renewalActivity.map((r: RenewalActivityRow) => ({
        patientId: r.patientId,
        outcome: r.outcome,
        when: r.when.toISOString(),
        amountPaid: r.amountPaid,
      })),
    },
    finance,
    skalex: {
      activeConversations: skalex.activeConversations,
      linkedToPatient: skalex.linkedToPatient,
      linkedToLeadOnly: skalex.linkedToLeadOnly,
      unlinked: skalex.unlinked,
      conversionToLead,
      topLabels: skalex.labelsByName.slice(0, 8).map((l) => ({ name: l.name, count: l.count })),
      phases: skalex.aiPhaseCounts,
    },
  };
}

// ─────────────────────── IA (Sonnet) ───────────────────────

export type CeoNarrative = {
  resumenEjecutivo: string;
  luces: string[];
  sombras: string[];
  accionesRecomendadas: string[];
  alertas: string[];
  tendencias: string[];
};

const SYSTEM_PROMPT = `Eres el asesor de negocio del CEO de FisioFit, una clinica online de fisioterapia deportiva.

Recibiras un JSON con:
  - "current": snapshot de las metricas del periodo actual (ventas, llamadas, no-show %, setter IA vs setter humano, renovaciones, ingresos, conversaciones Skalex).
  - "previous": mismas metricas del periodo anterior de la misma duracion (comparativa).
  - "history": lista de los ultimos informes guardados con su resumen y metricas clave, para que puedas detectar tendencias mas largas y no repetirte.

Devuelve EXCLUSIVAMENTE un JSON valido con esta forma (sin texto antes ni despues, sin code fences):

{
  "resumenEjecutivo": "3-5 frases. Vision global del periodo: como ha ido en negocio, lo mas destacable, comparativa breve vs periodo anterior. Empieza con el titular. Español, tono directo, para el CEO.",
  "luces": ["3-5 cosas concretas que han ido bien", "cada una una frase con NUMEROS del JSON"],
  "sombras": ["2-4 cosas que preocupan o van a peor", "cada una con contexto y numeros"],
  "accionesRecomendadas": ["3-5 acciones concretas", "verbos claros", "priorizadas de mayor a menor impacto"],
  "alertas": ["0-3 riesgos criticos que requieren atencion inmediata (churn subiendo mucho, no-show >30%, etc)"],
  "tendencias": ["2-4 patrones observables mirando el historico ('llevamos 3 semanas subiendo revenue', 'setter IA supera al humano por 4a vez')"]
}

Reglas ESTRICTAS:
- NUNCA inventes numeros — usa solo los que vienen en el JSON.
- Las comparativas vs previous tienen que ser reales (calcula deltas mentalmente con los numeros dados).
- Si un valor en previous es null, no puedes calcular delta — di "sin comparativa disponible".
- Si history esta vacio, no fuerces la seccion tendencias — devuelve array vacio.
- Preferir concreto sobre generico: "Ana Garcia cerro 3 ventas de ADVANCE" es mejor que "buen mes comercial".
- Si algo no aparece en el JSON, no lo menciones. NO alucines pacientes, closers ni programas.
- Cuando dudes entre optimista y prudente, prudente.
- El CEO ya conoce el negocio — no expliques que es setter IA ni que es no-show. Ve al grano.`;

async function generateNarrativeWithAi(payload: {
  current: CeoMetricsSnapshot;
  previous: CeoMetricsSnapshot | null;
  history: Array<{ periodLabel: string; periodStart: string; summaryLine: string; keyMetrics: any }>;
}): Promise<CeoNarrative | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL_SONNET,
        max_tokens: 2500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(payload) }],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const text: string = j?.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);

    const str = (v: any, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const arr = (v: any, max = 8) =>
      Array.isArray(v) ? v.filter((s: any) => typeof s === "string" && s.trim()).slice(0, max) : [];

    const resumenEjecutivo = str(parsed.resumenEjecutivo);
    if (!resumenEjecutivo) return null;

    return {
      resumenEjecutivo,
      luces: arr(parsed.luces, 8),
      sombras: arr(parsed.sombras, 6),
      accionesRecomendadas: arr(parsed.accionesRecomendadas, 6),
      alertas: arr(parsed.alertas, 5),
      tendencias: arr(parsed.tendencias, 6),
    };
  } catch {
    return null;
  }
}

// ─────────────────────── Orquestador ───────────────────────

/**
 * Devuelve rango del PERIODO ANTERIOR de la misma longitud, terminando
 * justo antes del start. Ej: si el periodo es "Julio 2026", el previo es
 * "01-30 junio 2026" (misma cantidad de dias).
 */
function previousPeriodRange(start: Date, end: Date): { start: Date; end: Date } {
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return { start: prevStart, end: prevEnd };
}

/** Extrae los cardinales clave de un snapshot para pasarlos al historico
 *  sin inflar el prompt (evitamos mandar 5 KB por informe previo). */
function keyMetricsFromSnapshot(s: CeoMetricsSnapshot) {
  return {
    revenue: s.finance.income,
    profit: s.finance.profit,
    ventasCerradas: s.sales.won,
    noShowPct: s.sales.showUpRate != null ? 100 - s.sales.showUpRate : null,
    renovacionesRenewed: s.renewals.renewed,
    renovacionesLost: s.renewals.lost,
    renewalRatePct: s.renewals.renewalRate,
    aiCloseRate: s.leadOrigin.aiCloseRate,
    setterCloseRate: s.leadOrigin.setterCloseRate,
    skalexActive: s.skalex.activeConversations,
  };
}

export async function generateCeoReport(opts: {
  periodType: CeoPeriodType;
  start: Date;
  end: Date;
  label: string;
  generatedById?: string | null;
}) {
  const current = await collectCeoMetrics({
    type: opts.periodType,
    start: opts.start,
    end: opts.end,
    label: opts.label,
  });

  // Periodo anterior de la misma longitud, para delta directo.
  const prevRange = previousPeriodRange(opts.start, opts.end);
  const previous = await collectCeoMetrics({
    type: opts.periodType,
    start: prevRange.start,
    end: prevRange.end,
    label: "periodo anterior",
  }).catch(() => null);

  // Ultimos 4 informes del mismo periodType (excluyendo custom, que no
  // comparan bien entre si), para dar contexto de tendencia larga.
  const historyRaw = opts.periodType === "custom"
    ? []
    : await (prisma as any).ceoReport.findMany({
        where: { periodType: opts.periodType, periodStart: { lt: opts.start } },
        orderBy: { periodStart: "desc" },
        take: 4,
      });

  const history = historyRaw.map((r: any) => {
    let keyMetrics: any = null;
    try {
      const parsed = JSON.parse(r.metrics);
      keyMetrics = keyMetricsFromSnapshot(parsed);
    } catch { keyMetrics = null; }
    let summaryLine = "";
    try {
      const n = JSON.parse(r.narrative);
      summaryLine = typeof n?.resumenEjecutivo === "string" ? n.resumenEjecutivo.slice(0, 400) : "";
    } catch { /* dejar vacio */ }
    return {
      periodLabel: r.periodLabel as string,
      periodStart: r.periodStart.toISOString(),
      summaryLine,
      keyMetrics,
    };
  });

  const narrative = await generateNarrativeWithAi({ current, previous, history });

  // Fallback: si la IA falla o no hay API key, guardamos un narrative
  // minimo con los numeros crudos para no dejar la UI vacia.
  const finalNarrative: CeoNarrative = narrative ?? {
    resumenEjecutivo: `Periodo ${opts.label}: ${current.sales.won} ventas, ${current.renewals.renewed} renovaciones, revenue ${current.finance.income}€ (sin analisis IA disponible).`,
    luces: [],
    sombras: [],
    accionesRecomendadas: [],
    alertas: [],
    tendencias: [],
  };

  const created = await (prisma as any).ceoReport.create({
    data: {
      periodType: opts.periodType,
      periodStart: opts.start,
      periodEnd: opts.end,
      periodLabel: opts.label,
      metrics: JSON.stringify(current),
      narrative: JSON.stringify(finalNarrative),
      generatedById: opts.generatedById ?? null,
    },
  });

  return { id: created.id as string, narrative: finalNarrative, metrics: current };
}
