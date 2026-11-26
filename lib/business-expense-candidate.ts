import { prisma } from "@/lib/prisma";
import { expenseCandidate, candidateDate } from "@/lib/business-expense-candidate-contract";
import type { z } from "zod";
export async function storeExpenseCandidate(data: z.infer<typeof expenseCandidate>) {
  const key = { source: data.source, sourceRef: data.sourceRef };
  const row = await prisma.businessExpenseCandidate.upsert({
    where: { source_sourceRef: key },
    create: { ...key, merchant: data.merchant, description: data.description, amountCents: data.amountCents, occurredAt: candidateDate(data.date), category: data.category },
    update: {},
  });
  // A reused source identity with changed financial details is a conflict, never an overwrite.
  const matches = row.amountCents === data.amountCents && row.occurredAt.toISOString().slice(0,10) === data.date &&
    row.merchant === data.merchant && row.description === data.description;
  return matches ? { id: row.id, status: row.status } : null;
}
