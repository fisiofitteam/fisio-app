import { z } from "zod";
const text = z.string().trim().min(1).max(3000);
const reportId = z.string().regex(/^grok-ceo-\d{4}-\d{2}-\d{2}$/);
export const founderSubmission = z.discriminatedUnion("kind", [
  z.object({ id: z.string().uuid(), kind: z.literal("analysis"), message: text, reportId: reportId.optional() }).strict(),
  z.object({ id: z.string().uuid(), kind: z.literal("decision"), reportId, decisionIndex: z.number().int().min(0).max(2), decision: z.enum(["approved","rejected"]), message: z.string().trim().max(3000) }).strict(),
]);
export const advisoryReply = z.object({ id: z.string().uuid(), response: text }).strict();
export function decisionQuestion(narrative: string, index: number): string | null {
  try {
    const item = JSON.parse(narrative)?.decisionesFounder?.[index];
    return typeof item === "string" && item.trim() && item.length <= 700 ? item : null;
  } catch { return null; }
}
