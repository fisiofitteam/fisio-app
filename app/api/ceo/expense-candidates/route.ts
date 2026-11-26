import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { founderSession } from "@/lib/grok-ceo-exchange";
import { expenseCandidate, expenseReview, dayBounds } from "@/lib/business-expense-candidate-contract";
import { normalizeMerchant } from "@/lib/bank-finance-contract";
import { storeExpenseCandidate } from "@/lib/business-expense-candidate";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
async function body(req: NextRequest): Promise<unknown> {
  if (!req.headers.get("content-type")?.startsWith("application/json")) return null;
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 12000) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export async function GET() {
  if (!await founderSession()) return json({ error: "Forbidden" }, 403);
  try {
    const [pending, history, pendingCount] = await Promise.all([
      prisma.businessExpenseCandidate.findMany({ where: { status: "pending" }, orderBy: { occurredAt: "desc" }, take: 100 }),
      prisma.businessExpenseCandidate.findMany({ where: { status: { in: ["approved","rejected"] } }, orderBy: { reviewedAt: "desc" }, take: 50 }),
      prisma.businessExpenseCandidate.count({ where: { status: "pending" } }),
    ]);
    return json({ pending, history, pendingCount, ingestConfigured: (process.env.GROK_EXPENSE_INGEST_TOKEN?.length ?? 0) >= 32 });
  } catch { return json({ error: "Bandeja de gastos temporalmente no disponible." }, 503); }
}
export async function POST(req: NextRequest) {
  if (!await founderSession()) return json({ error: "Forbidden" }, 403);
  const data = expenseCandidate.safeParse(await body(req));
  if (!data.success || data.data.source !== "manual") return json({ error: "Gasto inválido." }, 400);
  try {
    const saved = await storeExpenseCandidate(data.data);
    return saved ? json({ ok: true, ...saved }, 201) : json({ error: "Referencia ya utilizada con otros datos." }, 409);
  } catch { return json({ error: "No se pudo guardar el candidato." }, 503); }
}
export async function PATCH(req: NextRequest) {
  const user = await founderSession();
  if (!user) return json({ error: "Forbidden" }, 403);
  const data = expenseReview.safeParse(await body(req));
  if (!data.success) return json({ error: "Revisión inválida." }, 400);
  const d = data.data;
  try {
    const result = await prisma.$transaction(async tx => {
      const row = await tx.businessExpenseCandidate.findUnique({ where: { id: d.id } });
      if (!row) return { code: 404, error: "Gasto no encontrado." };
      if (row.status !== "pending") {
        const same = row.status === (d.action === "approve" ? "approved" : "rejected");
        return same ? { code: 200, ok: true, duplicate: true } : { code: 409, error: "Gasto ya revisado." };
      }
      const now = new Date();
      if (d.action === "approve") {
        const amount = row.amountCents / 100;
        const bank = await tx.bankMovement.findUnique({ where: { candidateId: row.id } });
        if (bank && (bank.personal || bank.conflict || bank.duplicateOfId)) return { code: 409, error: "Movimiento personal o modificado por el banco. Revísalo en Banco y tesorería." };
        // Cross-source matches are warnings, never silent deduplication of legitimate equal charges.
        const from = new Date(row.occurredAt.getTime() - 3 * 86400000);
        const until = new Date(row.occurredAt.getTime() + 4 * 86400000);
        const similar = await tx.businessExpenseCandidate.findMany({ where: { id: { not: row.id }, status: { in: ["pending", "approved"] }, amountCents: row.amountCents, occurredAt: { gte: from, lt: until } }, select: { merchant: true, description: true } });
        const merchantKey = bank?.merchantKey || normalizeMerchant(row.merchant);
        const crossSourceMatches = similar.filter(r => normalizeMerchant(r.merchant) === merchantKey).length;
        const bankDuplicates = bank ? await tx.bankMovement.count({ where: { id: { not: bank.id }, duplicateOfId: null, accountId: bank.accountId, fingerprint: bank.fingerprint } }) : 0;
        const duplicate = await tx.transaction.count({ where: { type: "expense", occurredAt: bank ? { gte: from, lt: until } : dayBounds(row.occurredAt), amount: { gte: amount - 0.005, lt: amount + 0.005 } } });
        if ((duplicate || crossSourceMatches || bankDuplicates) && !d.confirmDuplicate) return { code: 409, error: "Hay un gasto o candidato similar por importe, proveedor o fecha cercana. Revisa la bandeja y el libro antes de añadirlo.", potentialDuplicate: true, matches: duplicate + crossSourceMatches + bankDuplicates };
        const transactionId = "expense-review:" + row.id;
        const updated = await tx.businessExpenseCandidate.updateMany({ where: { id: row.id, status: "pending" }, data: { status: "approved", category: d.category, transactionId, reviewedAt: now, reviewedById: user.id, reviewNote: d.note || null } });
        if (!updated.count) return { code: 409, error: "Otra revisión ha cambiado el gasto. Actualiza la bandeja." };
        await tx.transaction.create({ data: { id: transactionId, type: "expense", category: d.category, amount, description: row.merchant + " · " + row.description, occurredAt: row.occurredAt } });
      } else {
        const updated = await tx.businessExpenseCandidate.updateMany({ where: { id: row.id, status: "pending" }, data: { status: "rejected", reviewedAt: now, reviewedById: user.id, reviewNote: d.note } });
        if (!updated.count) return { code: 409, error: "Otra revisión ha cambiado el gasto. Actualiza la bandeja." };
      }
      return { code: 200, ok: true };
    }, { isolationLevel: "Serializable" });
    const { code, ...payload } = result;
    return json(payload, code);
  } catch (e) {
    if (typeof e === "object" && e !== null && "code" in e && ["P2002","P2034"].includes(String(e.code))) return json({ error: "Conflicto de revisión. Actualiza la bandeja antes de reintentar." }, 409);
    return json({ error: "No se pudo guardar la revisión." }, 503);
  }
}
