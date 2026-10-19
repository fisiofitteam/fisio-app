import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { generatePaymentToken } from "@/lib/stripe";
import type { Prisma } from "@prisma/client";

const TOKEN_VALIDITY_DAYS = 7;
const PROGRAMS = ["RECUPERA", "CONSOLIDA", "ADVANCE"];

/**
 * Localiza la reserva de plaza pendiente de aplicar: SubscriptionRenewal
 * marcado como reserva, pagado (importe > 0) y aún no consumido en una
 * renovación real. Si hay varias, devuelve la más reciente.
 */
async function findPendingReservation(patientId: string, database: Pick<Prisma.TransactionClient, "subscriptionRenewal"> = prisma) {
  return await database.subscriptionRenewal.findFirst({
    where: {
      patientId,
      isReservation: true,
      reservationConsumedAt: null,
      amountPaid: { gt: 0 },
    },
    orderBy: { decidedAt: "desc" },
    select: { id: true, amountPaid: true, decidedAt: true },
  });
}

class RenewalLinkError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/**
 * GET /api/patients/[id]/renewal-link?probe=1
 * Devuelve la reserva pendiente si existe. Sirve para que el modal del
 * fisio muestre "tiene reserva de X€ pendiente, se descontará" antes de
 * escribir el importe.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const reservation = await findPendingReservation(params.id);
  return NextResponse.json({
    pendingReservation: reservation
      ? { id: reservation.id, amount: reservation.amountPaid ?? 0 }
      : null,
  });
}

// POST /api/patients/[id]/renewal-link
// Crea un enlace de pago de renovación para el paciente. Solo CEO/head_success.
// body: { programType, durationMonths, amountEuros }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Cualquier profesional del equipo puede generar el enlace de renovación.
  const user = await getActiveProfessional();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patient = await prisma.patient.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const programType = String(body?.programType || "");
  const durationMonths = Math.round(Number(body?.durationMonths));
  const amountEuros = Number(body?.amountEuros);

  if (!PROGRAMS.includes(programType)) {
    return NextResponse.json({ error: "Programa no válido" }, { status: 400 });
  }
  if (!Number.isFinite(durationMonths) || durationMonths < 1 || durationMonths > 24) {
    return NextResponse.json({ error: "Duración no válida (1-24 meses)" }, { status: 400 });
  }
  const grossAmountCents = Math.round(amountEuros * 100);
  if (!Number.isFinite(amountEuros) || !Number.isSafeInteger(grossAmountCents)
    || grossAmountCents <= 0 || grossAmountCents > 2147483647) {
    return NextResponse.json({ error: "Importe no válido" }, { status: 400 });
  }

  // Reserva de plaza: si el fisio marca el toggle, el enlace es una señal
  // (típ. 100€/1m). Se fuerza pago único — no admite fraccionamiento.
  const isReservation = body?.isReservation === true;
  const paymentProvider: "paypal" | "stripe" =
    body?.paymentProvider === "stripe" ? "stripe" : "paypal";

  // Fraccionamiento opcional (mismo criterio que Sale): null/1 → pago único,
  // 2..12 → suscripción PayPal con N cobros mensuales del mismo importe.
  // Ignorado si es reserva (una señal siempre va en un pago).
  let installmentCount: number | null = null;
  if (!isReservation) {
    const installmentCountRaw = Number(body?.installmentCount);
    if (Number.isFinite(installmentCountRaw) && installmentCountRaw >= 2) {
      if (installmentCountRaw > 12) {
        return NextResponse.json({ error: "installmentCount máximo 12" }, { status: 400 });
      }
      installmentCount = Math.floor(installmentCountRaw);
    }
  }

  // Renovación REAL: si hay reserva de plaza pendiente, descontamos su
  // importe. La reserva se marca como "consumida" ahora (aunque el pago
  // real aún esté pendiente) para evitar que dos links simultáneos se
  // lleven la misma reserva. Si el enlace no llega a pagarse el fisio
  // puede eliminarlo desde el panel y regenerarlo — no se re-abre la
  // reserva automáticamente, es más seguro que arriesgar duplicidades.
  const tokenExpiresAt = new Date();
  tokenExpiresAt.setDate(tokenExpiresAt.getDate() + TOKEN_VALIDITY_DAYS);
  try {
    const result = await prisma.$transaction(async (tx) => {
      let discountCents = 0;
      let reservationId: string | null = null;
      if (!isReservation) {
        const pending = await findPendingReservation(patient.id, tx);
        if (pending && (pending.amountPaid ?? 0) > 0) {
          discountCents = Math.round((pending.amountPaid ?? 0) * 100);
          if (!Number.isSafeInteger(discountCents) || discountCents <= 0 || discountCents >= grossAmountCents) {
            throw new RenewalLinkError(`El importe (${amountEuros.toFixed(2)}€) es menor o igual que la reserva pendiente (${(pending.amountPaid ?? 0).toFixed(2)}€). Sube el importe.`, 400);
          }
          // Claim the exact, still-free deposit before creating the checkout.
          // The whole transaction rolls back if the claim or creation fails.
          const claimed = await tx.subscriptionRenewal.updateMany({
            where: { id: pending.id, patientId: patient.id, isReservation: true,
              reservationConsumedAt: null, amountPaid: pending.amountPaid },
            data: { reservationConsumedAt: new Date() },
          });
          if (claimed.count !== 1) throw new RenewalLinkError("La reserva acaba de cambiar o ya se ha aplicado. Actualiza la ficha y vuelve a generar el enlace.", 409);
          reservationId = pending.id;
        }
      }
      const amountCents = grossAmountCents - discountCents;
      const checkout = await tx.renewalCheckout.create({
        data: {
          patientId: patient.id, createdById: user.id, programType, durationMonths,
          // Payment providers continue charging ONLY the remaining balance.
          amountCents, grossAmountCents, depositAppliedCents: discountCents, reservationId,
          paymentToken: generatePaymentToken(), tokenExpiresAt, status: "pending",
          installmentCount, isReservation, paymentProvider,
        },
        select: { paymentToken: true },
      });
      return { checkout, amountCents, discountCents };
    });
    return NextResponse.json({
      token: result.checkout.paymentToken,
      url: `/renovar/${result.checkout.paymentToken}`,
      amountCents: result.amountCents,
      discountCents: result.discountCents,
    });
  } catch (error) {
    if (error instanceof RenewalLinkError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
