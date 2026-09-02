/**
 * POST /api/admin/fix-pablo-torres-renewal
 *
 * Script ONE-SHOT: reconcilia la renovación de Pablo Torres que se quedó
 * colgada porque el webhook PayPal nunca llegó (o llegó tras el timeout
 * del polling). Busca su RenewalCheckout pendiente más reciente con
 * paypalOrderId, consulta PayPal, y si el pago está COMPLETED aplica la
 * renovación (crea SubscriptionRenewal + Transaction + marca checkout
 * paid) igual que haría el webhook.
 *
 * Idempotente: si ya está paid, no toca nada. Solo CEO.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getOrder, captureOrder } from "@/lib/paypal/orders";
import { applyRenewal } from "@/lib/renewals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1. Buscar paciente
  const patient = await prisma.patient.findFirst({
    where: { fullName: { contains: "Pablo Torres", mode: "insensitive" } },
    select: { id: true, fullName: true, assignedProfessionalId: true },
  });
  if (!patient) {
    return NextResponse.json({ error: "Paciente Pablo Torres no encontrado" }, { status: 404 });
  }

  // 2. Buscar el RenewalCheckout más reciente pending con paypalOrderId
  const checkout = await prisma.renewalCheckout.findFirst({
    where: {
      patientId: patient.id,
      status: "pending",
      paypalOrderId: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!checkout) {
    // Quizás ya está resuelto o no hay pending
    const anyRecent = await prisma.renewalCheckout.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, status: true, paypalOrderId: true, createdAt: true, amountCents: true, renewalId: true },
    });
    return NextResponse.json({
      ok: false,
      reason: "No hay RenewalCheckout pendiente con paypalOrderId",
      recent: anyRecent,
    });
  }

  // 3. Consultar PayPal
  const orderId = checkout.paypalOrderId!;
  let order: any;
  try {
    order = await getOrder(orderId);
  } catch (e: any) {
    return NextResponse.json({ error: `Error consultando PayPal Order ${orderId}: ${e?.message}` }, { status: 500 });
  }

  // Si está APPROVED (aprobado pero no capturado), capturamos ahora.
  if (order?.status === "APPROVED") {
    try {
      await captureOrder(orderId);
      order = await getOrder(orderId);
    } catch (e: any) {
      return NextResponse.json({ error: `Capture falló: ${e?.message}` }, { status: 500 });
    }
  }

  if (order?.status !== "COMPLETED") {
    return NextResponse.json({
      ok: false,
      reason: `PayPal reporta status="${order?.status}", no COMPLETED. No aplicamos renovación.`,
      order: { id: orderId, status: order?.status },
    });
  }

  const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
  const totalEur = checkout.amountCents / 100;
  const installments = checkout.installmentCount ?? 0;
  const isReservation = checkout.isReservation === true;
  const isSubscription = !!checkout.paypalSubscriptionId;

  // 4. Aplicar renovación (igual que el webhook)
  const { renewalId } = await applyRenewal({
    patientId: patient.id,
    programType: checkout.programType,
    periodMonths: checkout.durationMonths,
    amountPaid: totalEur,
    professionalId: checkout.createdById,
    isReservation,
    notes: isReservation
      ? "Reserva de plaza (PayPal) · reconciliado manualmente"
      : isSubscription
        ? `Renovación PayPal (${installments} cuotas) · reconciliado manualmente`
        : "Renovación PayPal · reconciliado manualmente",
  });

  await prisma.renewalCheckout.update({
    where: { id: checkout.id },
    data: {
      status: "paid",
      paidAt: new Date(),
      renewalId,
      paymentMethod: isSubscription ? "paypal_subscription" : "paypal",
      paypalCaptureId: capture?.id ?? checkout.paypalCaptureId,
    },
  });

  // 5. Crear Transaction (solo pago único; en suscripción cada cuota se
  // registra al llegar PAYMENT.SALE.COMPLETED del webhook).
  if (!isSubscription) {
    await prisma.transaction.create({
      data: {
        type: "income_renewal",
        category: `${checkout.programType} ${checkout.durationMonths}M`,
        amount: totalEur,
        description: isReservation
          ? `Reserva de plaza PayPal · ${checkout.programType} · reconciliado`
          : `Renovación PayPal · ${checkout.programType} ${checkout.durationMonths} meses · reconciliado`,
        occurredAt: new Date(),
        patientId: patient.id,
        professionalId: checkout.createdById,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    patient: patient.fullName,
    checkoutId: checkout.id,
    renewalId,
    amountEur: totalEur,
    paypalOrderId: orderId,
    paypalCaptureId: capture?.id ?? null,
  });
}
