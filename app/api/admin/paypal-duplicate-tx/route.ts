/**
 * GET /api/admin/paypal-duplicate-tx
 *
 * Devuelve pares sospechosos de Transaction duplicadas por el bug PayPal
 * subscription (activated + PAYMENT.SALE.COMPLETED). Solo lectura, solo CEO.
 *
 * Criterio: dos transacciones income_renewal o income_new del MISMO paciente,
 * MISMA cantidad, ambas con "PayPal" en la descripción, y creadas en un
 * intervalo < 24 horas.
 *
 * El CEO decide cuál borrar (la más "activated" tiene descripción "cuota 1/N",
 * la de PAYMENT.SALE.COMPLETED tiene "cuota N/M" con N==2 anómalo).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = {
  patientId: string;
  patientName: string;
  amount: number;
  a: { id: string; type: string; description: string; occurredAt: string };
  b: { id: string; type: string; description: string; occurredAt: string };
};

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const txs = await prisma.transaction.findMany({
    where: {
      type: { in: ["income_new", "income_renewal"] },
      description: { contains: "PayPal" },
    },
    orderBy: { occurredAt: "asc" },
    include: { patient: { select: { id: true, fullName: true } } },
  });

  // Agrupar por (patientId, amount) y detectar pares con occurredAt < 24h
  const byKey = new Map<string, typeof txs>();
  for (const t of txs) {
    const key = `${t.patientId}:${t.amount.toFixed(2)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(t);
  }

  const pairs: Row[] = [];
  for (const [, list] of byKey) {
    list.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      const gapMs = b.occurredAt.getTime() - a.occurredAt.getTime();
      if (gapMs < 86_400_000) {
        pairs.push({
          patientId: a.patientId ?? "",
          patientName: a.patient?.fullName ?? "?",
          amount: a.amount,
          a: {
            id: a.id,
            type: a.type,
            description: a.description ?? "",
            occurredAt: a.occurredAt.toISOString(),
          },
          b: {
            id: b.id,
            type: b.type,
            description: b.description ?? "",
            occurredAt: b.occurredAt.toISOString(),
          },
        });
      }
    }
  }

  return NextResponse.json({ count: pairs.length, duplicates: pairs });
}
