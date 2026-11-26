import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { authorizeGrok } from "@/lib/grok-ceo-contract";

export { founderSubmission, advisoryReply, decisionQuestion } from "@/lib/grok-ceo-exchange-contract";
export async function founderSession() {
  const founderId = process.env.GROK_CEO_FOUNDER_ID;
  const user = await getActiveProfessional();
  return founderId && user?.role === "ceo" && user.id === founderId ? user : null;
}
export async function integrationFounder(header: string | null) {
  if (!authorizeGrok(header, process.env.GROK_CEO_EXCHANGE_TOKEN)) return null;
  const id = process.env.GROK_CEO_FOUNDER_ID;
  if (!id) return null;
  return prisma.professional.findFirst({ where: { id, role: "ceo", active: true }, select: { id: true } });
}
export const channelConfigured = () => (process.env.GROK_CEO_EXCHANGE_TOKEN?.length ?? 0) >= 32;
export const exchangeSelect = { id: true, reportId: true, decisionIndex: true, kind: true, decision: true, question: true, message: true, createdAt: true, response: true, respondedAt: true } as const;
