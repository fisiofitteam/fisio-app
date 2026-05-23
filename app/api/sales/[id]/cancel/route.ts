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
  if (user.role !== "ceo" && user.role !== "closer") {
    return NextResponse.json({ error: "Solo CEO o closer" }, { status: 403 });
  }

  const sale = await prisma.sale.findUnique({ where: { id: params.id } });
  if (!sale) return NextResponse.json({ error: "Sale no encontrado" }, { status: 404 });

  if (sale.status !== "pending") {
    return NextResponse.json(
      { error: `No se puede cancelar un sale en estado "${sale.status}"` },
      { status: 400 }
    );
  }

  await prisma.sale.update({
    where: { id: sale.id },
    data: { status: "expired" },
  });

  return NextResponse.json({ ok: true });
}
