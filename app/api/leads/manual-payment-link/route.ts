/**
 * POST /api/leads/manual-payment-link
 *
 * Variante del flujo Lead→Sale para altas manuales desde el modal "Nuevo
 * paciente". En vez de exigir que ya exista un Lead, lo creamos al vuelo
 * con los datos mínimos y luego generamos el Sale + token Stripe.
 *
 * Body:
 *   {
 *     fullName: string,
 *     email?: string,
 *     phone?: string,
 *     instagram?: string,
 *     productCode: ProductCode,         // RECUPERA_4M | RECUPERA_6M | CONSOLIDA_4M | CONSOLIDA_6M
 *     amountEuros?: number,             // opcional (precio custom). Si falta, usa el price preconfigurado.
 *   }
 *
 * Quién puede llamarlo:
 *   - CEO, head_success, fisio (mismos roles que pueden crear pacientes).
 *
 * Devuelve:
 *   {
 *     ok: true,
 *     leadId, saleId, paymentToken,
 *     landingUrl: "/contratar/<token>",
 *     productLabel, amountCents, currency, tokenExpiresAt,
 *   }
 *
 * Cuando el paciente pague, el webhook /api/webhooks/stripe creará el
 * Patient heredando email/phone/instagram desde el Lead (esto ya funciona).
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

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success" && user.role !== "fisio") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  // ── Validaciones ─────────────────────────────────────────────────────────
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  if (!fullName) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  const productCode = body?.productCode as ProductCode | undefined;
  if (!productCode || !(productCode in PRODUCT_CONFIG)) {
    return NextResponse.json({ error: "productCode inválido" }, { status: 400 });
  }
  const config = PRODUCT_CONFIG[productCode];

  const emailRaw = typeof body?.email === "string" ? body.email.trim() : "";
  const phoneRaw = typeof body?.phone === "string" ? body.phone.trim() : "";
  const instagramRaw = typeof body?.instagram === "string"
    ? body.instagram.trim().replace(/^@+/, "")
    : "";

  // Necesitamos al menos un canal de contacto para que el lead tenga sentido.
  if (!emailRaw && !phoneRaw && !instagramRaw) {
    return NextResponse.json(
      { error: "Indica al menos un dato de contacto: email, teléfono o Instagram" },
      { status: 400 }
    );
  }

  // contactType prioritario para que el flujo existente reconozca al lead.
  // El webhook Stripe usa este campo para decidir qué copiar al Patient.
  let contactType: "phone" | "email" | "instagram";
  let contactValue: string;
  if (phoneRaw) {
    contactType = "phone";
    contactValue = phoneRaw;
  } else if (emailRaw) {
    contactType = "email";
    contactValue = emailRaw.toLowerCase();
  } else {
    contactType = "instagram";
    contactValue = instagramRaw;
  }

  // ── Resolver precio ─────────────────────────────────────────────────────
  const priceId = getPriceIdForProduct(productCode);
  const customEuros = Number(body?.amountEuros);
  let amountCents: number;
  let currency = "eur";

  if (Number.isFinite(customEuros) && customEuros > 0) {
    if (customEuros < 1 || customEuros > 99999) {
      return NextResponse.json({ error: "Importe fuera de rango (1-99999)" }, { status: 400 });
    }
    amountCents = Math.round(customEuros * 100);
  } else {
    if (!priceId) {
      return NextResponse.json({ error: `Precio no configurado para ${productCode}` }, { status: 503 });
    }
    try {
      const price = await stripe.prices.retrieve(priceId);
      if (!price.unit_amount) {
        return NextResponse.json({ error: "El precio en Stripe no tiene unit_amount" }, { status: 502 });
      }
      amountCents = price.unit_amount;
      currency = (price.currency || "eur").toLowerCase();
    } catch (err: any) {
      console.error("[manual-payment-link] Stripe price retrieve failed:", err);
      return NextResponse.json({ error: "No se pudo obtener el precio desde Stripe" }, { status: 502 });
    }
  }

  // ── Crear Lead minimal + Sale en una transacción ────────────────────────
  const token = generatePaymentToken();
  const tokenExpiresAt = new Date(Date.now() + TOKEN_VALIDITY_DAYS * 86400 * 1000);

  const { lead, sale } = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        fullName,
        contactType,
        contactValue,
        email: emailRaw ? emailRaw.toLowerCase() : null,
        phone: phoneRaw || null,
        instagram: instagramRaw || null,
        aiSummary: `Alta manual con link de pago Stripe (${user.fullName})`,
        callScheduledAt: new Date(),
        status: "scheduled",
        // Quien crea el alta queda como closer del lead — así el ingreso
        // luego se atribuye correctamente en Finanzas.
        closerId: user.id,
      },
    });

    const sale = await tx.sale.create({
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

    return { lead, sale };
  });

  return NextResponse.json({
    ok: true,
    leadId: lead.id,
    saleId: sale.id,
    paymentToken: token,
    landingUrl: `/contratar/${token}`,
    productLabel: config.label,
    amountCents,
    currency,
    tokenExpiresAt: tokenExpiresAt.toISOString(),
  });
}
