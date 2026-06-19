// Cruce de gasto Meta con leads atribuidos y ventas para calcular ROAS real.
// Lee las atribuciones desde Lead.adUtmCampaign que la landing pública captura
// del query string ?utm_campaign=...

import { prisma } from "@/lib/prisma";

export type AttributionRow = {
  utmCampaign: string;            // el slug que viaja en utm_campaign
  leadsCount: number;             // leads atribuidos en el periodo
  wonCount: number;               // que se convirtieron en cliente (status=won)
  revenue: number;                // euros facturados (Sale.amount sumado)
};

/**
 * Para un periodo dado, agrupa los leads atribuidos a anuncios por su
 * utm_campaign y suma ventas / revenue cruzando con Sale.
 *
 * Los Leads sin utm_campaign quedan fuera (orgánicos / referidos / manuales).
 */
export async function getAttributionByCampaign(
  start: Date,
  end: Date,
): Promise<AttributionRow[]> {
  // Traemos los leads atribuidos del periodo, junto con sus sales.
  const leads = await prisma.lead.findMany({
    where: {
      adUtmCampaign: { not: null },
      createdAt: { gte: start, lte: end },
    },
    select: {
      id: true,
      status: true,
      adUtmCampaign: true,
      sales: { select: { amount: true } },
    },
  });

  const acc = new Map<string, AttributionRow>();
  for (const l of leads) {
    const key = l.adUtmCampaign!;
    if (!acc.has(key)) {
      acc.set(key, { utmCampaign: key, leadsCount: 0, wonCount: 0, revenue: 0 });
    }
    const row = acc.get(key)!;
    row.leadsCount += 1;
    if (l.status === "won") {
      row.wonCount += 1;
      for (const s of l.sales) row.revenue += s.amount || 0;
    }
  }
  return Array.from(acc.values()).sort((a, b) => b.revenue - a.revenue);
}

/** Calcula ROAS y CAC dado spend y revenue (y opcionalmente wonCount). */
export function computeRoas(spend: number, revenue: number): number {
  if (!spend || spend <= 0) return 0;
  return Math.round((revenue / spend) * 100) / 100;
}

export function computeCac(spend: number, wonCount: number): number | null {
  if (!wonCount) return null;
  return Math.round((spend / wonCount) * 100) / 100;
}
