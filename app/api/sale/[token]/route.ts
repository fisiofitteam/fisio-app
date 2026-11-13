/**
 * GET /api/sale/[token]
 *
 * Endpoint público (sin auth) que devuelve los datos básicos del Sale
 * para mostrarlos en la landing de contratación.
 *
 * El token es secreto suficiente porque es aleatorio de 48 chars hex.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PRODUCT_CONFIG } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const sale = await prisma.sale.findUnique({
    where: { paymentToken: params.token },
    include: {
      lead: { select: { fullName: true, email: true } },
    },
  });

  if (!sale) {
    return NextResponse.json({ error: "Link no válido" }, { status: 404 });
  }

  // Token expirado
  if (sale.tokenExpiresAt < new Date()) {
    return NextResponse.json(
      { error: "Este link ha expirado. Pide uno nuevo a tu closer." },
      { status: 410 }
    );
  }

  // Ya pagado: redirigir al cliente a la página de gracias
  if (sale.status === "paid") {
    return NextResponse.json({
      status: "paid",
      isReservation: sale.isReservation,
      sessionId: sale.stripeSessionId,
      message: "Este pago ya está completado.",
    });
  }

  if (sale.status !== "pending") return NextResponse.json({ error:"Este enlace de pago ya no está activo. Pide uno nuevo al equipo." }, {status:410});

  const config = PRODUCT_CONFIG[sale.productCode as keyof typeof PRODUCT_CONFIG];

  return NextResponse.json({
    status: sale.status,
    leadName: sale.lead.fullName,
    leadEmail: sale.lead.email,
    productCode: sale.productCode,
    programType: sale.programType,
    durationMonths: sale.durationMonths,
    label: config?.label || sale.productCode,
    amountCents: sale.amountCents,
    grossAmountCents:sale.grossAmountCents, depositCents:sale.depositAppliedCents,
    currency: sale.currency,
    installmentCount: sale.installmentCount ?? null,
    paymentProvider: (sale as any).paymentProvider ?? "paypal",
    isReservation: sale.isReservation,
  });
}
