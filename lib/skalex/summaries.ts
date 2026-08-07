/**
 * Helpers para obtener el análisis IA de Skalex asociado a Leads (o Patients).
 *
 * Se usa en las vistas de llamadas de venta para mostrar el contexto de la
 * conversación IA en cada card. Sin N+1: una sola query para muchos leads.
 */
import { prisma } from "@/lib/prisma";

export type LeadAiSummary = {
  phase: number | null;
  phaseName: string | null;
  analysis: string | null;
  nextStepGoal: string | null;
  updatedAt: Date | null;
};

/**
 * Devuelve el análisis IA más reciente por leadId. Si un lead tiene varias
 * conversaciones sincronizadas, nos quedamos con la de lastMessageAt más
 * reciente. Conversaciones sin análisis (aiAnalysis == null) las omitimos.
 */
export async function getSkalexAiForLeads(leadIds: string[]): Promise<Record<string, LeadAiSummary>> {
  if (leadIds.length === 0) return {};
  const rows = await prisma.skalexConversation.findMany({
    where: {
      leadId: { in: leadIds },
      aiAnalysis: { not: null },
    },
    select: {
      leadId: true,
      aiPhase: true,
      aiPhaseName: true,
      aiAnalysis: true,
      aiNextStepGoal: true,
      aiUpdatedAt: true,
      lastMessageAt: true,
    },
    orderBy: { lastMessageAt: "desc" },
  });
  const byLead: Record<string, LeadAiSummary> = {};
  for (const r of rows) {
    if (!r.leadId) continue;
    if (byLead[r.leadId]) continue; // ya tenemos el más reciente para este lead
    byLead[r.leadId] = {
      phase: r.aiPhase,
      phaseName: r.aiPhaseName,
      analysis: r.aiAnalysis,
      nextStepGoal: r.aiNextStepGoal,
      updatedAt: r.aiUpdatedAt,
    };
  }
  return byLead;
}
