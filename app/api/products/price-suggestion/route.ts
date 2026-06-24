/**
 * Devuelve el precio sugerido de un producto desde Stripe (para prellenar el
 * input "precio" del modal de generar link de venta). Solo CEO o closer.
 *
 * GET /api/products/price-suggestion?productCode=RECUPERA_4M
 *   → { amountCents, currency }
 *
 * Si no hay PRICE_ID env var configurado, devuelve null (front debe pedir
 * precio sin sugerencia).
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { stripe, PRODUCT_CONFIG, getPriceIdForProduct, type ProductCode } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "closer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const productCode = req.nextUrl.searchParams.get("productCode") as ProductCode | null;
  if (!productCode || !(productCode in PRODUCT_CONFIG)) {
    return NextResponse.json({ error: "productCode inválido" }, { status: 400 });
  }

  if (!stripe) {
    return NextResponse.json({ amountCents: null, currency: "eur", reason: "Stripe no configurado" });
  }
  const priceId = getPriceIdForProduct(productCode);
  if (!priceId) {
    return NextResponse.json({ amountCents: null, currency: "eur", reason: "Sin Price ID configurado" });
  }
  try {
    const price = await stripe.prices.retrieve(priceId);
    return NextResponse.json({
      amountCents: price.unit_amount ?? null,
      currency: (price.currency || "eur").toLowerCase(),
    });
  } catch {
    return NextResponse.json({ amountCents: null, currency: "eur", reason: "Error consultando Stripe" });
  }
}
