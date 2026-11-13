/**
 * POST /api/sales/[id]/cancel
 *
 * Anula un Sale en estado "pending" marcándolo como "expired".
 * Si ya estaba en otro estado (paid, refunded, failed, expired), no toca nada.
 *
 * Lo usa el closer cuando quiere regenerar un link de pago para el mismo lead.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sale = await prisma.sale.findUnique({ where: { id: params.id }, include: {
    lead:{select:{closerId:true}}, patient:{select:{assignedProfessionalId:true,derivations:{where:{toProfessionalId:user.id},select:{id:true},take:1}}}
  } });
  if (!sale) return NextResponse.json({ error: "Sale no encontrado" }, { status: 404 });

  const roles=[user.role,...user.extraRoles];
  const isOwnLead=roles.includes("closer")&&sale.lead.closerId===user.id;
  const isTreatingFisio=sale.grossAmountCents!=null&&roles.includes("fisio")&&
    (sale.patient?.assignedProfessionalId===user.id || !!sale.patient?.derivations.length);
  if(!user.isManager&&!isOwnLead&&!isTreatingFisio)return NextResponse.json({error:"No puedes gestionar este enlace."},{status:403});

  if (sale.status !== "pending") {
    return NextResponse.json(
      { error: `No se puede cancelar un sale en estado "${sale.status}"` },
      { status: 400 }
    );
  }

  const result = await prisma.sale.updateMany({
    where: { id:sale.id,status:"pending",...(sale.isReservation || sale.grossAmountCents!=null?{checkoutStartedAt:null,stripeSessionId:null,paypalOrderId:null,paypalSubscriptionId:null}:{}) },
    data: { status: "expired" },
  });

  if(!result.count)return NextResponse.json({error:"El pago ya está iniciado o ha cambiado. Verifica su estado antes de crear otro enlace."},{status:409});
  return NextResponse.json({ ok: true });
}
