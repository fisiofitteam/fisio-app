import { z } from "zod";
import { expenseCategories } from "./business-expense-candidate-contract";
export const normalizeMerchant = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 180);
const suppliers: [RegExp, string, typeof expenseCategories[number]][] = [
  [/\b(openai|chatgpt)\b/, "OpenAI", "software"], [/\banthropic\b/, "Anthropic", "software"],
  [/\b(vercel)\b/, "Vercel", "software"], [/\b(neon)\b/, "Neon", "software"],
  [/\b(manychat)\b/, "ManyChat", "software"], [/\b(kommodo)\b/, "Kommodo", "software"],
  [/\b(loom)\b/, "Loom", "software"], [/\b(notion)\b/, "Notion", "software"],
  [/\b(canva)\b/, "Canva", "software"], [/\b(ponto|isabel)\b/, "Ponto", "software"],
  [/\b(facebook|meta ads|fb ads)\b/, "Meta Ads", "marketing"], [/\bgoogle ads\b/, "Google Ads", "marketing"],
];
export type BankRule = { id: string; merchantKey: string; amountCents: number | null; category: string; personal: boolean; enabled: boolean };
export function classifyMovement(merchant: string, description: string, amountCents: number, rules: BankRule[]) {
  const text = normalizeMerchant(merchant + " " + description);
  const supplier = suppliers.find(([regex]) => regex.test(text));
  const name = supplier?.[1] || merchant || description || "Proveedor sin identificar";
  const merchantKey = normalizeMerchant(supplier?.[1] || merchant || description);
  const rule = rules.find(r => r.enabled && r.merchantKey === merchantKey && (r.amountCents === null || r.amountCents === Math.abs(amountCents)));
  const mortgage = amountCents === -20300 && /\b(hipoteca|hipotecario|hipotecaria|prestamo hipotecario)\b/.test(text);
  return { merchant: name.slice(0,180), merchantKey, category: rule?.category || supplier?.[2] || "otros", personal: rule?.personal ?? mortgage,
    reason: rule ? "Regla guardada" : mortgage ? "Hipoteca personal de 203 €" : supplier ? "Proveedor reconocido; pendiente de validar" : "Sin regla; revisar proveedor", ruleId: rule?.id || null };
}
export function cents(amount: number) {
  const value = Math.round(amount * 100);
  if (!Number.isSafeInteger(value) || Math.abs(value) > 100000000) throw new Error("amount_out_of_range");
  return value;
}
const bankDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });
export function bankExpenseDate(instant: Date) {
  const parts = Object.fromEntries(bankDateFormatter.formatToParts(instant).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const bankAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync") }).strict(),
  z.object({ action: z.literal("discover") }).strict(),
  z.object({ action: z.literal("selectAccount"), id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).strict(),
  z.object({ action: z.literal("pause"), paused: z.boolean() }).strict(),
  z.object({ action: z.literal("classify"), id: z.string().min(1).max(100), category: z.enum(expenseCategories), personal: z.boolean(), remember: z.boolean(), exactAmount: z.boolean().default(true) }).strict(),
  z.object({ action: z.literal("deleteRule"), id: z.string().min(1).max(100) }).strict(),
  z.object({ action: z.literal("duplicate"), id: z.string().min(1).max(100), duplicateOfId: z.string().min(1).max(100).nullable() }).strict(),
]);
export type RecurringMovement = { merchantKey: string; merchant: string; amountCents: number; occurredAt: Date; personal: boolean; conflict: boolean };
export function detectSubscriptions(rows: RecurringMovement[], now = new Date()) {
  const groups = new Map<string, RecurringMovement[]>();
  for (const row of rows) if (row.amountCents < 0 && !row.personal && !row.conflict && row.merchantKey) {
    const group = groups.get(row.merchantKey) || []; group.push(row); groups.set(row.merchantKey, group);
  }
  return [...groups.entries()].flatMap(([key, values]) => {
    const sorted = values.sort((a,b) => a.occurredAt.getTime()-b.occurredAt.getTime());
    if (sorted.length < 3) return [];
    const recent = sorted.slice(-4); const last = recent.at(-1)!;
    const intervals = recent.slice(1).map((r,i)=>(r.occurredAt.getTime()-recent[i].occurredAt.getTime())/86400000);
    const monthly = intervals.every(d=>d>=25&&d<=35); const yearly = intervals.every(d=>d>=350&&d<=380);
    const amount = Math.abs(last.amountCents);
    if ((!monthly&&!yearly) || recent.some(r=>Math.abs(Math.abs(r.amountCents)-amount)>Math.max(100,amount*0.05))) return [];
    const next = new Date(last.occurredAt); next.setUTCMonth(next.getUTCMonth()+(yearly?12:1));
    if (next.getTime() < now.getTime()-7*86400000) return [];
    return [{ merchantKey:key, merchant:last.merchant, amountCents:amount, cadence: yearly ? "annual" : "monthly", observations:sorted.length, nextExpectedAt:next.toISOString(), confidence:"suggested" }];
  });
}
export type Payout = { id: string; amount: number; currency: string; arrival_date: number; status: string };
export function matchStripePayout(row: { amountCents:number; currency:string; occurredAt:Date; description:string }, payouts: Payout[], used: Set<string>) {
  if (row.amountCents<=0 || !/\bstripe\b/i.test(row.description)) return null;
  const matches = payouts.filter(p=>!used.has(p.id)&&p.status==="paid"&&p.amount===row.amountCents&&p.currency.toUpperCase()===row.currency&&Math.abs(p.arrival_date*1000-row.occurredAt.getTime())<=5*86400000);
  return matches.length===1 ? matches[0].id : null;
}
