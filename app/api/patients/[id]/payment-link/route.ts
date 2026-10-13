import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { generatePaymentToken } from "@/lib/stripe";

const TOKEN_VALIDITY_DAYS = 7;

/**
 * POST /api/patients/[id]/payment-link
 *
 * Genera un enlace de cobro "suelto" para un paciente ya con programa.
 * Pensado para casos donde no procede abrir un nuevo periodo:
 *   - Suscripción inicial fallida que hay que recobrar.
 *   - Diferencia tras una reserva de plaza ya cobrada.
 *   - Recargos ad-hoc puntuales.
 *
 * El enlace reutiliza la landing /renovar/[token] y la plumería PayPal/
 * Stripe de las renovaciones (RenewalCheckout). Lo distinguimos con
 * programType="ADHOC" + durationMonths=1 — valores centinela que leen el
 * landing y applyRenewalCheckoutPaid() para NO crear SubscriptionRenewal
 * y solo registrar la Transaction del ingreso. Evitamos así una tabla
 * nueva y una migración.
 *
 * Solo CEO. Body:
 *   { amountEuros: number, installmentCount?: number|null,
 *     paymentProvider?: "paypal"|"stripe", description?: string }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo") {
    return NextResponse.json(
      { error: "Solo el CEO puede generar enlaces de pago sueltos" },
      { status: 403 },
    );
  }

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const amountEuros = Number(body?.amountEuros);
  if (!Number.isFinite(amountEuros) || amountEuros <= 0) {
    return NextResponse.json({ error: "Importe no válido" }, { status: 400 });
  }

  const paymentProvider: "paypal" | "stripe" =
    body?.paymentProvider === "stripe" ? "stripe" : "paypal";

  let installmentCount: number | null = null;
  const installmentCountRaw = Number(body?.installmentCount);
  if (Number.isFinite(installmentCountRaw) && installmentCountRaw >= 2) {
    if (installmentCountRaw > 12) {
      return NextResponse.json({ error: "installmentCount máximo 12" }, { status: 400 });
    }
    installmentCount = Math.floor(installmentCountRaw);
  }

  const amountCents = Math.round(amountEuros * 100);
  const tokenExpiresAt = new Date();
  tokenExpiresAt.setDate(tokenExpiresAt.getDate() + TOKEN_VALIDITY_DAYS);

  const checkout = await prisma.renewalCheckout.create({
    data: {
      patientId: patient.id,
      createdById: user.id,
      // Centinelas que diferencian este checkout de una renovación real.
      // La landing y applyRenewalCheckoutPaid los detectan vía programType.
      programType: "ADHOC",
      durationMonths: 1,
      amountCents,
      paymentToken: generatePaymentToken(),
      tokenExpiresAt,
      status: "pending",
      installmentCount,
      isReservation: false,
      paymentProvider,
    } as any,
    select: { paymentToken: true },
  });

  return NextResponse.json({
    token: checkout.paymentToken,
    url: `/renovar/${checkout.paymentToken}`,
    amountCents,
  });
}
