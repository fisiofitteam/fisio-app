import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { authorizeGrok } from "@/lib/grok-ceo-contract";

const text = z.string().trim().min(1).max(3000);
const reportId = z.string().regex(/^grok-ceo-\d{4}-\d{2}-\d{2}$/);
export const founderSubmission = z.discriminatedUnion("kind", [
  z.object({ id: z.string().uuid(), kind: z.literal("analysis"), message: text, reportId: reportId.optional() }).strict(),
  z.object({ id: z.string().uuid(), kind: z.literal("decision"), reportId, decisionIndex: z.number().int().min(0).max(2), decision: z.enum(["approved","rejected"]), message: z.string().trim().max(3000) }).strict(),
]);
export const advisoryReply = z.object({ id: z.string().uuid(), response: text }).strict();
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
export function decisionQuestion(narrative: string, index: number): string | null {
  try {
    const item = JSON.parse(narrative)?.decisionesFounder?.[index];
    return typeof item === "string" && item.trim() && item.length <= 700 ? item : null;
  } catch { return null; }
}
export const exchangeSelect = { id: true, reportId: true, decisionIndex: true, kind: true, decision: true, question: true, message: true, createdAt: true, response: true, respondedAt: true } as const;
