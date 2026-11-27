import { prisma } from "@/lib/prisma";
import { reportSchema, safeBusinessText, type AgentId, AGENT_IDS } from "./contract";
/** Existing read-only Grok channel: department conclusions, never source records or founder-only notes. */
export async function departmentBriefings() {
  const founderId = process.env.GROK_CEO_FOUNDER_ID;
  if (!founderId) return { status: "not_configured", reports: [] };
  try {
    const rows = await Promise.all(AGENT_IDS.filter(id => id !== "ceo").map(agentId => prisma.ceoAgentRun.findFirst({ where: { founderId, agentId, status: "completed" }, orderBy: { startedAt: "desc" }, select: { id: true, agentId: true, resultJson: true, startedAt: true, model: true } })));
    return { status: "available", definition: "Conclusiones departamentales: recomendaciones, nunca autorización ni ejecución. Comprobar antigüedad y modo de análisis.", reports: rows.flatMap(row => {
      if (!row) return [];
      let raw: unknown; try { raw = JSON.parse(row.resultJson || "null"); } catch { return []; }
      const parsed = reportSchema.safeParse(raw); if (!parsed.success) return [];
      return [{ runId: row.id, department: row.agentId as AgentId, asOf: row.startedAt.toISOString(), mode: row.model, summary: safeBusinessText(parsed.data.summary), limitations: parsed.data.limitations, recommendations: parsed.data.recommendations.map(r => ({ title: safeBusinessText(r.title), rationale: safeBusinessText(r.rationale), evidenceKeys: r.evidenceKeys, state: "recommendation_only" })) }];
    }) };
  } catch { return { status: "unavailable", reports: [] }; }
}
