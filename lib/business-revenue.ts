// Ingresos por NUEVAS ALTAS para el cálculo de ROAS de anuncios.
// Fuente: modelo Transaction con type="income_new". Renovaciones (income_renewal)
// y otros (income_other) NO cuentan — los anuncios captan altas, no renovaciones.

import { prisma } from "@/lib/prisma";

/**
 * Devuelve ingresos diarios por nuevas altas, agrupados por día (occurredAt).
 * Útil para gráficos de evolución.
 */
export async function getDailyRevenue(start: Date, end: Date): Promise<Array<{ date: string; revenue: number }>> {
  const txs = await prisma.transaction.findMany({
    where: {
      type: "income_new",
      occurredAt: { gte: start, lte: end },
    },
    select: { occurredAt: true, amount: true },
  });

  const byDate = new Map<string, number>();
  for (const t of txs) {
    const day = t.occurredAt.toISOString().slice(0, 10);
    byDate.set(day, (byDate.get(day) ?? 0) + (t.amount || 0));
  }
  return Array.from(byDate.entries())
    .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Suma total de ingresos por nuevas altas en el periodo. */
export async function getTotalRevenue(start: Date, end: Date): Promise<number> {
  const result = await prisma.transaction.aggregate({
    where: {
      type: "income_new",
      occurredAt: { gte: start, lte: end },
    },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}
