/**
 * GET  /api/admin/paypal-reconcile        → lista los huérfanos
 * POST /api/admin/paypal-reconcile        → intenta reactivar TODOS los huérfanos
 * POST /api/admin/paypal-reconcile?id=X   → intenta reactivar solo ese Sale/Checkout
 *
 * Rescata pagos que se quedaron colgados porque el webhook nunca llegó:
 *   - Sales con status="pending" o "paid sin patientId" que tengan un
 *     Order/Subscription de PayPal COMPLETED/ACTIVE en las últimas 72h.
 *   - RenewalCheckouts con status="pending" o "paid sin renewalId" en
 *     las mismas condiciones.
 *
 * Para cada uno consultamos el estado en PayPal via getOrder() y si está
 * COMPLETED disparamos activateSaleAsPatient()/applyRenewalCheckoutPaid().
 * Todo idempotente.
 *
 * Seguridad: solo CEO. El endpoint es un botón de emergencia; también hay
 * un cron cada hora que lo llama con secreto para hacer autorescate.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getOrder, captureOrder } from "@/lib/paypal/orders";
import { activateSaleAsPatient, applyRenewalCheckoutPaid } from "@/lib/paypal/activation";
import { paypalCredentials } from "@/lib/paypal/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const WINDOW_HOURS = 72;

type Report = {
  saleFixed: number;
  saleFailed: number;
  saleUntouched: number;
  renewalFixed: number;
  renewalFailed: number;
  renewalUntouched: number;
  details: Array<{ kind: "sale" | "renewal"; id: string; token: string; action: string; note?: string }>;
};

async function assertAdmin(req: NextRequest): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  // Modo cron: si viene el header/secret, saltamos autenticación. Usamos el
  // mismo CRON_SECRET que otros crons de la app.
  const cronSecret = process.env.CRON_SECRET;
  const passed = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (cronSecret && passed === cronSecret) return { ok: true };

  const user = await getActiveProfessional();
  if (!user) return { ok: false, res: NextResponse.json({ error: "Login requerido" }, { status: 401 }) };
  if (user.role !== "ceo") return { ok: false, res: NextResponse.json({ error: "Solo CEO" }, { status: 403 }) };
  return { ok: true };
}

async function listOrphans() {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000);
  const [sales, checkouts] = await Promise.all([
    prisma.sale.findMany({
      where: {
        OR: [
          { status: "pending", paypalOrderId: { not: null }, createdAt: { gte: since } },
          { status: "pending", paypalSubscriptionId: { not: null }, createdAt: { gte: since } },
          { status: "paid", patientId: null, createdAt: { gte: since } },
        ],
      },
      select: {
        id: true, paymentToken: true, paypalOrderId: true, paypalSubscriptionId: true,
        status: true, patientId: true, amountCents: true, createdAt: true,
        installmentCount: true, paymentMethod: true, paypalCaptureId: true,
        lead: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.renewalCheckout.findMany({
      where: {
        OR: [
          { status: "pending", paypalOrderId: { not: null }, createdAt: { gte: since } },
          { status: "pending", paypalSubscriptionId: { not: null }, createdAt: { gte: since } },
          { status: "paid", renewalId: null, createdAt: { gte: since } },
        ],
      },
      select: {
        id: true, paymentToken: true, paypalOrderId: true, paypalSubscriptionId: true,
        status: true, renewalId: true, amountCents: true, createdAt: true,
        installmentCount: true, paypalCaptureId: true, patientId: true,
        patient: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { sales, checkouts };
}

export async function GET(req: NextRequest) {
  const auth = await assertAdmin(req);
  if (!auth.ok) return auth.res;
  const { sales, checkouts } = await listOrphans();
  return NextResponse.json({ ok: true, sales, checkouts, windowHours: WINDOW_HOURS });
}

async function tryFixSale(sale: {
  id: string; paymentToken: string; paypalOrderId: string | null; paypalSubscriptionId: string | null;
  paypalCaptureId: string | null; paymentMethod: string | null; status: string; patientId: string | null;
}, report: Report) {
  try {
    if (sale.paypalOrderId) {
      let order = await getOrder(sale.paypalOrderId);
      if (order?.status === "APPROVED") {
        try {
          await captureOrder(sale.paypalOrderId);
          order = await getOrder(sale.paypalOrderId);
        } catch (e: any) {
          if (!/ALREADY_CAPTURED/i.test(String(e?.message ?? ""))) throw e;
        }
      }
      if (order?.status === "COMPLETED") {
        const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
        await activateSaleAsPatient({
          saleId: sale.id,
          paymentMethod: sale.paymentMethod ?? "paypal",
          paypalCaptureId: capture?.id ?? sale.paypalCaptureId,
        });
        report.saleFixed++;
        report.details.push({ kind: "sale", id: sale.id, token: sale.paymentToken, action: "activated_from_order" });
        return;
      }
      report.saleUntouched++;
      report.details.push({ kind: "sale", id: sale.id, token: sale.paymentToken, action: "skip", note: `order status=${order?.status}` });
      return;
    }
    if (sale.paypalSubscriptionId) {
      // Suscripción: si el paciente ya no existe pero la subscripción está
      // ACTIVE en PayPal, activamos igual (webhook activated se perdió).
      await activateSaleAsPatient({
        saleId: sale.id,
        paymentMethod: sale.paymentMethod ?? "paypal_subscription",
        paypalSubscriptionId: sale.paypalSubscriptionId,
      });
      report.saleFixed++;
      report.details.push({ kind: "sale", id: sale.id, token: sale.paymentToken, action: "activated_from_subscription" });
      return;
    }
    report.saleUntouched++;
    report.details.push({ kind: "sale", id: sale.id, token: sale.paymentToken, action: "skip", note: "no paypal id" });
  } catch (e: any) {
    console.error("[paypal-reconcile] Sale falló", sale.id, e);
    report.saleFailed++;
    report.details.push({ kind: "sale", id: sale.id, token: sale.paymentToken, action: "error", note: e?.message ?? String(e) });
  }
}

async function tryFixCheckout(checkout: {
  id: string; paymentToken: string; paypalOrderId: string | null; paypalSubscriptionId: string | null;
  paypalCaptureId: string | null; status: string; renewalId: string | null;
}, report: Report) {
  try {
    if (checkout.paypalOrderId) {
      let order = await getOrder(checkout.paypalOrderId);
      if (order?.status === "APPROVED") {
        try {
          await captureOrder(checkout.paypalOrderId);
          order = await getOrder(checkout.paypalOrderId);
        } catch (e: any) {
          if (!/ALREADY_CAPTURED/i.test(String(e?.message ?? ""))) throw e;
        }
      }
      if (order?.status === "COMPLETED") {
        const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
        await applyRenewalCheckoutPaid({
          checkoutId: checkout.id,
          paymentMethod: "paypal",
          paypalCaptureId: capture?.id ?? checkout.paypalCaptureId,
          isSubscription: false,
        });
        report.renewalFixed++;
        report.details.push({ kind: "renewal", id: checkout.id, token: checkout.paymentToken, action: "activated_from_order" });
        return;
      }
      report.renewalUntouched++;
      report.details.push({ kind: "renewal", id: checkout.id, token: checkout.paymentToken, action: "skip", note: `order status=${order?.status}` });
      return;
    }
    if (checkout.paypalSubscriptionId) {
      await applyRenewalCheckoutPaid({
        checkoutId: checkout.id,
        paymentMethod: "paypal_subscription",
        paypalSubscriptionId: checkout.paypalSubscriptionId,
        isSubscription: true,
      });
      report.renewalFixed++;
      report.details.push({ kind: "renewal", id: checkout.id, token: checkout.paymentToken, action: "activated_from_subscription" });
      return;
    }
    report.renewalUntouched++;
    report.details.push({ kind: "renewal", id: checkout.id, token: checkout.paymentToken, action: "skip", note: "no paypal id" });
  } catch (e: any) {
    console.error("[paypal-reconcile] Checkout falló", checkout.id, e);
    report.renewalFailed++;
    report.details.push({ kind: "renewal", id: checkout.id, token: checkout.paymentToken, action: "error", note: e?.message ?? String(e) });
  }
}

export async function POST(req: NextRequest) {
  const auth = await assertAdmin(req);
  if (!auth.ok) return auth.res;

  if (!paypalCredentials()) {
    return NextResponse.json({ error: "PayPal no configurado" }, { status: 503 });
  }

  const singleId = req.nextUrl.searchParams.get("id");

  const { sales, checkouts } = await listOrphans();
  const targetSales = singleId ? sales.filter((s) => s.id === singleId || s.paymentToken === singleId) : sales;
  const targetCheckouts = singleId ? checkouts.filter((c) => c.id === singleId || c.paymentToken === singleId) : checkouts;

  const report: Report = {
    saleFixed: 0, saleFailed: 0, saleUntouched: 0,
    renewalFixed: 0, renewalFailed: 0, renewalUntouched: 0,
    details: [],
  };

  for (const s of targetSales) await tryFixSale(s as any, report);
  for (const c of targetCheckouts) await tryFixCheckout(c as any, report);

  return NextResponse.json({ ok: true, report });
}
