/**
 * POST /api/admin/sales/[id]/refund
 *
 * Devuelve una venta. Solo CEO. Efectos:
 *   1) (opcional) Refund del capture en PayPal + cancel de la suscripción
 *      si es sub PayPal. Si mode === "mark_only", este paso se salta
 *      (útil cuando el CEO ya devolvió a mano desde el dashboard de PayPal).
 *   2) Marca Sale como refunded en nuestra BD (refundedAt, reason, by).
 *   3) Marca al Patient asociado como isTest=true → desaparece de todas las
 *      métricas de venta, comisiones, KPIs, etc. Mecanismo ya existente y
 *      probado en el resto del sistema.
 *   4) Borra las Transactions de ingreso "income_new" asociadas a ese
 *      paciente (las de la venta original). El histórico se mantiene por
 *      el propio Sale con status "refunded".
 *
 * Body:
 *   { reason: string; mode: "paypal_and_mark" | "mark_only" }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { refundCapture, cancelSubscription } from "@/lib/paypal/refunds";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const reason = String(body?.reason ?? "").trim();
  const mode: "paypal_and_mark" | "mark_only" = body?.mode === "mark_only" ? "mark_only" : "paypal_and_mark";
  if (!reason) return NextResponse.json({ error: "Motivo obligatorio" }, { status: 400 });

  const sale = await prisma.sale.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      paypalCaptureId: true,
      paypalSubscriptionId: true,
      patientId: true,
      refundedAt: true,
    },
  });
  if (!sale) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
  // Si el sale ya está marcado como refundeado, permitimos re-ejecutar para
  // aplicar cualquier efecto que faltase (p.ej. terminar renewals añadido
  // después). Todos los pasos siguientes son idempotentes.
  const alreadyRefunded = !!sale.refundedAt;

  // ── Paso 1: PayPal ───────────────────────────────────────────────────────
  const paypalReport: { refund?: any; cancel?: any; skipped?: boolean } = {};
  // Si el sale ya estaba marcado, no reintentamos PayPal aunque el user
  // hubiese pedido paypal_and_mark: es reprocesado de efectos secundarios.
  if (mode === "paypal_and_mark" && !alreadyRefunded) {
    if (sale.paypalCaptureId) {
      paypalReport.refund = await refundCapture(sale.paypalCaptureId, reason);
      if (!paypalReport.refund.ok) {
        return NextResponse.json(
          { error: `PayPal refund falló: ${paypalReport.refund.error}. Puedes reintentar o marcar sin PayPal si ya lo devolviste manualmente.` },
          { status: 502 },
        );
      }
    }
    if (sale.paypalSubscriptionId) {
      paypalReport.cancel = await cancelSubscription(sale.paypalSubscriptionId, reason);
      if (!paypalReport.cancel.ok) {
        // El refund ya salió bien; no podemos "des-refundear". Reportamos
        // error de cancel pero seguimos con el marcado (el CEO puede cancelar
        // luego a mano si es necesario).
        console.warn("[refund] cancel sub falló pero refund ya se hizo", paypalReport.cancel.error);
      }
    }
  } else {
    paypalReport.skipped = true;
  }

  // ── Paso 2: Marcar Sale como refunded ────────────────────────────────────
  // Si ya estaba marcado, no pisamos refundedAt/reason/by (audit trail).
  if (!alreadyRefunded) {
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        status: "refunded",
        refundedAt: new Date(),
        refundReason: reason,
        refundedByProfessionalId: user.id,
        refundedManually: mode === "mark_only",
      },
    });
  }

  // ── Paso 3: Paciente → isTest ────────────────────────────────────────────
  if (sale.patientId) {
    await prisma.patient.update({
      where: { id: sale.patientId },
      data: { isTest: true },
    });
  }

  // ── Paso 4: Borrar Transactions income_new del paciente ─────────────────
  let deletedTx = 0;
  if (sale.patientId) {
    const del = await prisma.transaction.deleteMany({
      where: { patientId: sale.patientId, type: "income_new" },
    });
    deletedTx = del.count;
  }

  // ── Paso 5: Terminar renovaciones activas/programadas ──────────────────
  // Sin esto, activePatientCondition() sigue considerando "activo" al paciente
  // porque tiene un SubscriptionRenewal con status=active y endDate futuro.
  // Marcarlo como ended con endDate=hoy lo saca del panel del fisio,
  // notificaciones, alertas y "programa a punto de terminar".
  let endedRenewals = 0;
  if (sale.patientId) {
    const upd = await prisma.subscriptionRenewal.updateMany({
      where: { patientId: sale.patientId, status: { in: ["active", "scheduled"] } },
      data: { status: "ended", endDate: new Date() },
    });
    endedRenewals = upd.count;
  }

  return NextResponse.json({
    ok: true,
    mode,
    paypal: paypalReport,
    deletedTransactions: deletedTx,
    endedRenewals,
    patientMarkedAsTest: !!sale.patientId,
  });
}
