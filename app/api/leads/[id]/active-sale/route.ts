/**
 * GET /api/leads/[id]/active-sale
 *
 * Devuelve el Sale pending+vigente del lead, si existe. El modal del closer lo
 * usa al abrirse para saber si debe mostrar el link existente o el wizard.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canOperateReservation } from "@/lib/initial-reservation";
import { getActiveProfessional } from "@/lib/session";
import { PRODUCT_CONFIG, type ProductCode } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const lead = await prisma.lead.findUnique({where:{id:params.id},select:{closerId:true}});
  if (!lead || !canOperateReservation(user, lead.closerId)) return NextResponse.json({ error: "Lead no disponible." }, { status: 403 });

  const sale = await prisma.sale.findFirst({
    where: {
      leadId: params.id,
      status: "pending",
      tokenExpiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!sale) {
    return NextResponse.json({ activeSale: null });
  }

  const config = PRODUCT_CONFIG[sale.productCode as ProductCode];

  return NextResponse.json({
    activeSale: {
      id: sale.id,
      paymentToken: sale.paymentToken,
      landingUrl: `/contratar/${sale.paymentToken}`,
      productCode: sale.productCode,
      productLabel: (sale.isReservation ? "Señal de reserva · " : "") + (config?.label || sale.productCode),
      isReservation: sale.isReservation,
      amountCents: sale.amountCents,
      currency: sale.currency,
      installmentCount: sale.installmentCount ?? null,
      tokenExpiresAt: sale.tokenExpiresAt.toISOString(),
      createdAt: sale.createdAt.toISOString(),
    },
  });
}
