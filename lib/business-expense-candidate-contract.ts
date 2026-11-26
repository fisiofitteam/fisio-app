import { z } from "zod";
export const expenseCategories = ["software", "sueldos", "marketing", "otros"] as const;
export const expenseSources = ["manual", "gmail", "stripe", "bank", "subscription"] as const;
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(s + "T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s;
}, "Invalid date");
export const expenseCandidate = z.object({
  source: z.enum(expenseSources),
  sourceRef: z.string().trim().min(1).max(180),
  merchant: z.string().trim().min(1).max(180),
  description: z.string().trim().min(1).max(600),
  amountCents: z.number().int().min(1).max(100000000),
  currency: z.literal("EUR"),
  date: dateOnly,
  category: z.enum(expenseCategories),
}).strict();
export const expenseReview = z.discriminatedUnion("action", [
  z.object({ id: z.string().min(1).max(100), action: z.literal("approve"), category: z.enum(expenseCategories), confirmDuplicate: z.boolean().default(false), note: z.string().trim().max(600).default("") }).strict(),
  z.object({ id: z.string().min(1).max(100), action: z.literal("reject"), note: z.string().trim().min(1).max(600) }).strict(),
]);
export function candidateDate(date: string) { return new Date(date + "T12:00:00Z"); }
export function dayBounds(date: Date) {
  const start = new Date(date); start.setUTCHours(0,0,0,0);
  const end = new Date(start); end.setUTCDate(end.getUTCDate()+1);
  return { gte: start, lt: end };
}
