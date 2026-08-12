/**
 * Helpers para obtener el análisis IA de Skalex asociado a Leads (o Patients).
 *
 * Se usa en las vistas de llamadas de venta para mostrar el contexto de la
 * conversación IA en cada card. Sin N+1: dos queries agrupadas para muchos leads.
 */
import { prisma } from "@/lib/prisma";

export type LeadAiSummary = {
  phase: number | null;
  phaseName: string | null;
  analysis: string | null;
  nextStepGoal: string | null;
  updatedAt: Date | null;
};

/** Normaliza teléfono a solo dígitos. */
function normPhone(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.replace(/[^\d]/g, "");
  return t.length >= 6 ? t : null;
}
/** Normaliza handle Instagram: sin "@" y en minúsculas. */
function normIg(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim().replace(/^@+/, "").toLowerCase();
  return t || null;
}

/**
 * Devuelve el análisis IA más reciente por leadId.
 *
 * Estrategia:
 *  1. Match directo por SkalexConversation.leadId (el sync ya lo ligó).
 *  2. Para los leads sin match directo, fallback por customerPhone o
 *     igUsername normalizados — captura conversaciones que el forward-sync
 *     acaba de bajar y aún no tienen leadId ligado.
 *
 * Si un lead tiene varias conversaciones, nos quedamos con la de
 * lastMessageAt más reciente. Conversaciones sin análisis IA se omiten.
 */
export async function getSkalexAiForLeads(leadIds: string[]): Promise<Record<string, LeadAiSummary>> {
  if (leadIds.length === 0) return {};

  const byLead: Record<string, LeadAiSummary> = {};

  // 1) Match directo por leadId.
  const direct = await prisma.skalexConversation.findMany({
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
  for (const r of direct) {
    if (!r.leadId || byLead[r.leadId]) continue;
    byLead[r.leadId] = {
      phase: r.aiPhase,
      phaseName: r.aiPhaseName,
      analysis: r.aiAnalysis,
      nextStepGoal: r.aiNextStepGoal,
      updatedAt: r.aiUpdatedAt,
    };
  }

  // 2) Fallback por teléfono/instagram para los leads sin match directo.
  const missingIds = leadIds.filter((id) => !byLead[id]);
  if (missingIds.length === 0) return byLead;

  const missingLeads = await prisma.lead.findMany({
    where: { id: { in: missingIds } },
    select: { id: true, phone: true, instagram: true },
  });
  const phoneToLeadId = new Map<string, string>();
  const igToLeadId = new Map<string, string>();
  for (const l of missingLeads) {
    const p = normPhone(l.phone);
    if (p) phoneToLeadId.set(p, l.id);
    const ig = normIg(l.instagram);
    if (ig) igToLeadId.set(ig, l.id);
  }
  if (phoneToLeadId.size === 0 && igToLeadId.size === 0) return byLead;

  const orConds: any[] = [];
  if (phoneToLeadId.size > 0) orConds.push({ customerPhone: { in: Array.from(phoneToLeadId.keys()) } });
  if (igToLeadId.size > 0) orConds.push({ igUsername: { in: Array.from(igToLeadId.keys()) } });
  const fallback = await prisma.skalexConversation.findMany({
    where: {
      aiAnalysis: { not: null },
      OR: orConds,
    },
    select: {
      customerPhone: true,
      igUsername: true,
      aiPhase: true,
      aiPhaseName: true,
      aiAnalysis: true,
      aiNextStepGoal: true,
      aiUpdatedAt: true,
      lastMessageAt: true,
    },
    orderBy: { lastMessageAt: "desc" },
  });
  for (const r of fallback) {
    const p = normPhone(r.customerPhone);
    const ig = normIg(r.igUsername);
    const leadId = (p && phoneToLeadId.get(p)) || (ig && igToLeadId.get(ig));
    if (!leadId || byLead[leadId]) continue;
    byLead[leadId] = {
      phase: r.aiPhase,
      phaseName: r.aiPhaseName,
      analysis: r.aiAnalysis,
      nextStepGoal: r.aiNextStepGoal,
      updatedAt: r.aiUpdatedAt,
    };
  }

  return byLead;
}
