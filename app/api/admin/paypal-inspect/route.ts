/**
 * GET /api/admin/paypal-inspect?email=xxx@yy.com
 * GET /api/admin/paypal-inspect?token=<paymentToken>
 *
 * Diagnóstico profundo de UN paciente concreto para saber exactamente
 * qué pasó con su intento de pago:
 *   1. Busca Lead + Sale por email (o Sale por paymentToken).
 *   2. Busca Patient + RenewalCheckout por email.
 *   3. Para cada Sale/RenewalCheckout con paypalOrderId o paypalSubscriptionId,
 *      consulta el estado real en PayPal.
 *   4. Compara BD vs PayPal y sugiere acción (activar, dejar como está, marcar
 *      expired…).
 *
 * Solo CEO.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getOrder } from "@/lib/paypal/orders";
import { getSubscription } from "@/lib/paypal/subscriptions";
import { paypalCredentials } from "@/lib/paypal/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function inspectSale(sale: any) {
  const out: any = {
    id: sale.id,
    paymentToken: sale.paymentToken,
    status: sale.status,
    createdAt: sale.createdAt,
    paidAt: sale.paidAt,
    amountCents: sale.amountCents,
    installmentCount: sale.installmentCount,
    patientId: sale.patientId,
    paypalOrderId: sale.paypalOrderId,
    paypalSubscriptionId: sale.paypalSubscriptionId,
    paypalCaptureId: sale.paypalCaptureId,
    leadName: sale.lead?.fullName,
  };
  if (sale.paypalOrderId) {
    try {
      const order = await getOrder(sale.paypalOrderId);
      out.paypal_order_status = order?.status;
      out.paypal_order_intent = order?.intent;
      out.paypal_order_captures = order?.purchase_units?.[0]?.payments?.captures?.map((c: any) => ({
        id: c.id, status: c.status, amount: c.amount,
      }));
    } catch (e: any) {
      out.paypal_order_error = e?.message ?? String(e);
    }
  }
  if (sale.paypalSubscriptionId) {
    try {
      const sub = await getSubscription(sale.paypalSubscriptionId);
      out.paypal_subscription_status = sub?.status;
      out.paypal_subscription_billing_info = sub?.billing_info;
    } catch (e: any) {
      out.paypal_subscription_error = e?.message ?? String(e);
    }
  }
  // Diagnóstico legible
  const notes: string[] = [];
  if (sale.status === "pending" && out.paypal_order_status === "APPROVED") {
    notes.push("🟠 Order APROBADA en PayPal pero NO CAPTURADA. El cliente aprobó, pero no se capturó el pago. Acción: llamar reconcile.");
  }
  if (sale.status === "pending" && out.paypal_order_status === "COMPLETED") {
    notes.push("🟢 Order COMPLETADA en PayPal pero Sale sigue pending en BD. Acción: llamar reconcile YA.");
  }
  if (sale.status === "pending" && out.paypal_order_status === "CREATED") {
    notes.push("⚪ Order solo CREADA, el cliente nunca aprobó en PayPal. Sin acción.");
  }
  if (sale.status === "pending" && out.paypal_order_status === "VOIDED") {
    notes.push("⚫ Order ANULADA en PayPal. Marcar Sale como expired/failed.");
  }
  if (sale.status === "paid" && !sale.patientId) {
    notes.push("🔴 Sale marcado paid pero SIN patientId. Activación incompleta. Acción: llamar reconcile.");
  }
  out.diagnosis = notes;
  return out;
}

async function inspectCheckout(checkout: any) {
  const out: any = {
    id: checkout.id,
    paymentToken: checkout.paymentToken,
    status: checkout.status,
    createdAt: checkout.createdAt,
    paidAt: checkout.paidAt,
    amountCents: checkout.amountCents,
    installmentCount: checkout.installmentCount,
    renewalId: checkout.renewalId,
    paypalOrderId: checkout.paypalOrderId,
    paypalSubscriptionId: checkout.paypalSubscriptionId,
    paypalCaptureId: checkout.paypalCaptureId,
    patientName: checkout.patient?.fullName,
  };
  if (checkout.paypalOrderId) {
    try {
      const order = await getOrder(checkout.paypalOrderId);
      out.paypal_order_status = order?.status;
      out.paypal_order_captures = order?.purchase_units?.[0]?.payments?.captures?.map((c: any) => ({
        id: c.id, status: c.status, amount: c.amount,
      }));
    } catch (e: any) {
      out.paypal_order_error = e?.message ?? String(e);
    }
  }
  if (checkout.paypalSubscriptionId) {
    try {
      const sub = await getSubscription(checkout.paypalSubscriptionId);
      out.paypal_subscription_status = sub?.status;
    } catch (e: any) {
      out.paypal_subscription_error = e?.message ?? String(e);
    }
  }
  const notes: string[] = [];
  if (checkout.status === "pending" && out.paypal_order_status === "APPROVED") {
    notes.push("🟠 Order aprobada en PayPal pero NO capturada. Acción: reconcile.");
  }
  if (checkout.status === "pending" && out.paypal_order_status === "COMPLETED") {
    notes.push("🟢 Order COMPLETADA en PayPal pero checkout pending. Acción: reconcile YA.");
  }
  if (checkout.status === "paid" && !checkout.renewalId) {
    notes.push("🔴 Checkout paid pero sin renewalId. Activación incompleta.");
  }
  out.diagnosis = notes;
  return out;
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Login requerido" }, { status: 401 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  if (!paypalCredentials()) return NextResponse.json({ error: "PayPal no configurado" }, { status: 503 });

  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  const token = req.nextUrl.searchParams.get("token")?.trim();

  if (!email && !token) {
    return NextResponse.json({ error: "Pasa ?email= o ?token=" }, { status: 400 });
  }

  // Buscar Sales por email de Lead
  let sales: any[] = [];
  if (email) {
    const leads = await prisma.lead.findMany({
      where: {
        OR: [
          { email: { equals: email, mode: "insensitive" } },
          { contactType: "email", contactValue: { equals: email, mode: "insensitive" } },
        ],
      },
      select: { id: true, fullName: true, email: true, sales: true },
    });
    for (const l of leads) {
      for (const s of l.sales) sales.push({ ...s, lead: { fullName: l.fullName, email: l.email } });
    }
  }
  if (token) {
    const s = await prisma.sale.findUnique({
      where: { paymentToken: token },
      include: { lead: { select: { fullName: true, email: true } } },
    });
    if (s) sales.push(s);
  }

  // Buscar RenewalCheckouts por email de Patient
  let checkouts: any[] = [];
  if (email) {
    const patients = await prisma.patient.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, fullName: true, email: true, renewalCheckouts: true },
    });
    for (const p of patients) {
      for (const c of p.renewalCheckouts) checkouts.push({ ...c, patient: { fullName: p.fullName } });
    }
  }
  if (token) {
    const c = await prisma.renewalCheckout.findUnique({
      where: { paymentToken: token },
      include: { patient: { select: { fullName: true } } },
    });
    if (c) checkouts.push(c);
  }

  const salesInspected = await Promise.all(sales.map(inspectSale));
  const checkoutsInspected = await Promise.all(checkouts.map(inspectCheckout));

  return NextResponse.json({
    query: { email, token },
    salesFound: sales.length,
    renewalCheckoutsFound: checkouts.length,
    sales: salesInspected,
    renewalCheckouts: checkoutsInspected,
  });
}
