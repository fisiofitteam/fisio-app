/**
 * POST /api/admin/create-test-sale
 *
 * Crea un Sale de prueba con datos dummy para previsualizar la landing de
 * contratación sin necesidad de tener Stripe configurado todavía.
 *
 * Solo CEO. NO usar en producción real con clientes.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { generatePaymentToken } from "@/lib/stripe";

export async function POST() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  // Buscar un lead cualquiera para vincular (o crear uno dummy)
  let lead = await prisma.lead.findFirst({ orderBy: { createdAt: "desc" } });
  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        fullName: "Test Paciente",
        email: "test@example.com",
        phone: "+34 600 000 000",
        status: "won",
      },
    });
  }

  const token = generatePaymentToken();
  const sale = await prisma.sale.create({
    data: {
      leadId: lead.id,
      closerId: user.id,
      productCode: "RECUPERA_4M",
      programType: "RECUPERA",
      durationMonths: 4,
      amountCents: 60000,
      currency: "eur",
      stripePriceId: "price_test_placeholder",
      paymentToken: token,
      tokenExpiresAt: new Date(Date.now() + 7 * 86400 * 1000),
      status: "pending",
    },
  });

  return NextResponse.json({
    ok: true,
    landingUrl: `/contratar/${token}`,
    saleId: sale.id,
    leadName: lead.fullName,
  });
}
