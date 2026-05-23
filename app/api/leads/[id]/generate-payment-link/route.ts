/**
 * POST /api/leads/[id]/generate-payment-link
 *
 * Crea un Sale para este lead y devuelve la URL de contratación.
 *
 * Body: { productCode: "RECUPERA_4M" | "RECUPERA_6M" | "CONSOLIDA_4M" | "CONSOLIDA_6M" }
 *
 * Pre-condiciones:
 * - Solo CEO o closer pueden generar links
 * - El lead debe estar en status "won"
 * - Si ya hay un Sale "pending" activo para este lead, devuelve 409 (el front debe
 *   primero llamar a /api/sales/[id]/cancel para anularlo, y luego reintentar)
 *
 * El precio se consulta a Stripe API en vivo (no se hardcodea en código).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import {
  stripe,
  PRODUCT_CONFIG,
  getPriceIdForProduct,
  generatePaymentToken,
  type ProductCode,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";

const TOKEN_VALIDITY_DAYS = 3;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo" && user.role !== "closer") {
    return NextResponse.json({ error: "Solo CEO o closer pueden generar links de pago" }, { status: 403 });
  }

  if (!stripe) {
    return NextResponse.json({ error: "Stripe no está configurado" }, { status: 503 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const productCode = body?.productCode as ProductCode | undefined;
  if (!productCode || !(productCode in PRODUCT_CONFIG)) {
    return NextResponse.json({ error: "productCode inválido" }, { status: 400 });
  }
  const config = PRODUCT_CONFIG[productCode];

  // 1. Buscar lead
  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
  if (lead.status !== "won") {
    return NextResponse.json(
      { error: 'El lead debe estar marcado como "Vendida" (won) antes de generar el link' },
      { status: 400 }
    );
  }

  // 2. Comprobar que no hay otro Sale "pending" activo
  const existingPending = await prisma.sale.findFirst({
    where: {
      leadId: lead.id,
      status: "pending",
      tokenExpiresAt: { gt: new Date() },
    },
  });
  if (existingPending) {
    return NextResponse.json(
      {
        error: "Ya hay un link activo para este lead",
        code: "PENDING_SALE_EXISTS",
        existingSale: {
          id: existingPending.id,
          paymentToken: existingPending.paymentToken,
          landingUrl: `/contratar/${existingPending.paymentToken}`,
          productCode: existingPending.productCode,
          tokenExpiresAt: existingPending.tokenExpiresAt,
        },
      },
      { status: 409 }
    );
  }

  // 3. Resolver priceId y obtener precio real desde Stripe
  const priceId = getPriceIdForProduct(productCode);
  if (!priceId) {
    return NextResponse.json({ error: `Precio no configurado para ${productCode}` }, { status: 503 });
  }

  let amountCents: number;
  let currency: string;
  try {
    const price = await stripe.prices.retrieve(priceId);
    if (!price.unit_amount) {
      return NextResponse.json({ error: "El precio en Stripe no tiene unit_amount" }, { status: 502 });
    }
    amountCents = price.unit_amount;
    currency = (price.currency || "eur").toLowerCase();
  } catch (err: any) {
    console.error("[generate-payment-link] Stripe price retrieve failed:", err);
    return NextResponse.json({ error: "No se pudo obtener el precio desde Stripe" }, { status: 502 });
  }

  // 4. Generar token + crear Sale
  const token = generatePaymentToken();
  const tokenExpiresAt = new Date(Date.now() + TOKEN_VALIDITY_DAYS * 86400 * 1000);

  const sale = await prisma.sale.create({
    data: {
      leadId: lead.id,
      closerId: user.id,
      productCode,
      programType: config.programType,
      durationMonths: config.durationMonths,
      stripePriceId: priceId,
      amountCents,
      currency,
      paymentToken: token,
      tokenExpiresAt,
      status: "pending",
    },
  });

  return NextResponse.json({
    ok: true,
    saleId: sale.id,
    paymentToken: token,
    landingUrl: `/contratar/${token}`,
    productLabel: config.label,
    amountCents,
    currency,
    tokenExpiresAt: tokenExpiresAt.toISOString(),
  });
}
