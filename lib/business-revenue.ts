// Ingresos diarios del negocio para gráficos de tendencia.
// Suma Sale.amountCents (status=paid, paidAt en el rango) agrupado por día.

import { prisma } from "@/lib/prisma";

export async function getDailyRevenue(start: Date, end: Date): Promise<Array<{ date: string; revenue: number }>> {
  const sales = await prisma.sale.findMany({
    where: {
      status: "paid",
      paidAt: { gte: start, lte: end },
    },
    select: { paidAt: true, amountCents: true },
  });

  const byDate = new Map<string, number>();
  for (const s of sales) {
    if (!s.paidAt) continue;
    const day = s.paidAt.toISOString().slice(0, 10);
    byDate.set(day, (byDate.get(day) ?? 0) + (s.amountCents || 0) / 100);
  }
  return Array.from(byDate.entries())
    .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Suma total de revenue del periodo (atajo). */
export async function getTotalRevenue(start: Date, end: Date): Promise<number> {
  const sales = await prisma.sale.aggregate({
    where: { status: "paid", paidAt: { gte: start, lte: end } },
    _sum: { amountCents: true },
  });
  return ((sales._sum.amountCents ?? 0)) / 100;
}
