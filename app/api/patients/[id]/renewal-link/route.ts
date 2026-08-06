import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { generatePaymentToken } from "@/lib/stripe";

const TOKEN_VALIDITY_DAYS = 7;
const PROGRAMS = ["RECUPERA", "CONSOLIDA", "ADVANCE"];

/**
 * Localiza la reserva de plaza pendiente de aplicar: SubscriptionRenewal
 * marcado como reserva, pagado (importe > 0) y aún no consumido en una
 * renovación real. Si hay varias, devuelve la más reciente.
 */
async function findPendingReservation(patientId: string) {
  return await prisma.subscriptionRenewal.findFirst({
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
  if (!Number.isFinite(amountEuros) || amountEuros <= 0) {
    return NextResponse.json({ error: "Importe no válido" }, { status: 400 });
  }

  // Reserva de plaza: si el fisio marca el toggle, el enlace es una señal
  // (típ. 100€/1m). Se fuerza pago único — no admite fraccionamiento.
  const isReservation = body?.isReservation === true;

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
  let amountCents = Math.round(amountEuros * 100);
  let discountCents = 0;
  let consumedReservationId: string | null = null;
  if (!isReservation) {
    const pending = await findPendingReservation(patient.id);
    if (pending && (pending.amountPaid ?? 0) > 0) {
      discountCents = Math.round((pending.amountPaid ?? 0) * 100);
      if (discountCents >= amountCents) {
        return NextResponse.json(
          {
            error: `El importe (${amountEuros.toFixed(2)}€) es menor o igual que la reserva pendiente (${(pending.amountPaid ?? 0).toFixed(2)}€). Sube el importe.`,
          },
          { status: 400 }
        );
      }
      amountCents -= discountCents;
      consumedReservationId = pending.id;
    }
  }

  const tokenExpiresAt = new Date();
  tokenExpiresAt.setDate(tokenExpiresAt.getDate() + TOKEN_VALIDITY_DAYS);

  const checkout = await prisma.renewalCheckout.create({
    data: {
      patientId: patient.id,
      createdById: user.id,
      programType,
      durationMonths,
      amountCents,
      paymentToken: generatePaymentToken(),
      tokenExpiresAt,
      status: "pending",
      installmentCount,
      isReservation,
    },
    select: { paymentToken: true },
  });

  // Marcar reserva como consumida (idempotente si ya lo estaba: nadie
  // más la puede pillar en carrera). Se hace después de crear el
  // checkout para asegurar que el link ya existe.
  if (consumedReservationId) {
    await prisma.subscriptionRenewal.update({
      where: { id: consumedReservationId },
      data: { reservationConsumedAt: new Date() },
    });
  }

  return NextResponse.json({
    token: checkout.paymentToken,
    url: `/renovar/${checkout.paymentToken}`,
    amountCents,
    discountCents,
  });
}
