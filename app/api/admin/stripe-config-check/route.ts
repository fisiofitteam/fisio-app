/**
 * GET /api/admin/stripe-config-check
 *
 * Diagnóstico rápido de Stripe: credenciales OK, webhooks configurados
 * y qué eventos tienen suscritos. Lo usamos para saber si a un webhook
 * le falta invoice.paid (que registra las cuotas como Transaction) o
 * checkout.session.completed (que activa el Patient/Renewal).
 *
 * Solo CEO. No expone secretos.
 */
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CRITICAL_EVENTS = [
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

function prefix(v: string | null | undefined, n = 10): string | null {
  if (!v) return null;
  return v.slice(0, n) + (v.length > n ? "…" : "");
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Login requerido" }, { status: 401 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Solo CEO" }, { status: 403 });

  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const envInfo = {
    secretKeyPrefix: prefix(secret ?? null, 12),
    secretKeyIsLive: secret?.startsWith("sk_live_") ?? false,
    secretKeyIsTest: secret?.startsWith("sk_test_") ?? false,
    webhookSecretPrefix: prefix(webhookSecret ?? null, 12),
    webhookSecretConfigured: !!webhookSecret,
  };

  if (!secret) {
    return NextResponse.json({
      env: envInfo,
      verdict: "❌ STRIPE_SECRET_KEY no configurado",
    });
  }

  const stripe = new Stripe(secret, { apiVersion: "2024-06-20" as any });

  let auth: { ok: boolean; accountId?: string; email?: string; error?: string } = { ok: false };
  try {
    const acct = await stripe.accounts.retrieve();
    auth = { ok: true, accountId: acct.id, email: (acct as any).email ?? undefined };
  } catch (e: any) {
    auth = { ok: false, error: e?.message ?? String(e) };
  }

  let endpoints: Array<{
    id: string;
    url: string;
    status: string;
    enabledEvents: string[];
    missingCritical: string[];
  }> = [];
  let endpointsError: string | null = null;
  if (auth.ok) {
    try {
      const list = await stripe.webhookEndpoints.list({ limit: 20 });
      endpoints = list.data.map((w) => {
        const events = w.enabled_events ?? [];
        const isWildcard = events.includes("*");
        const missing = isWildcard ? [] : CRITICAL_EVENTS.filter((ce) => !events.includes(ce));
        return {
          id: w.id,
          url: w.url,
          status: w.status,
          enabledEvents: events,
          missingCritical: missing,
        };
      });
    } catch (e: any) {
      endpointsError = e?.message ?? String(e);
    }
  }

  const productionEndpoint = endpoints.find((e) => e.url.includes("app.fisiofitteam.com/api/webhooks/stripe"));

  const problems: string[] = [];
  if (!auth.ok) problems.push(`Autenticación STRIPE falla: ${auth.error}`);
  if (!webhookSecret) problems.push("STRIPE_WEBHOOK_SECRET no configurado en Vercel (imprescindible para verificar firma).");
  if (auth.ok && endpoints.length === 0) problems.push("No hay webhooks configurados en esta cuenta de Stripe.");
  if (auth.ok && endpoints.length > 0 && !productionEndpoint) {
    problems.push("Existen webhooks en Stripe pero ninguno apunta a app.fisiofitteam.com/api/webhooks/stripe.");
  }
  if (productionEndpoint && productionEndpoint.missingCritical.length > 0) {
    problems.push(`Al webhook de producción le faltan ${productionEndpoint.missingCritical.length} eventos: ${productionEndpoint.missingCritical.join(", ")}`);
  }
  if (productionEndpoint && productionEndpoint.status !== "enabled") {
    problems.push(`Webhook de producción no está enabled (status: ${productionEndpoint.status}).`);
  }

  return NextResponse.json({
    env: envInfo,
    auth,
    endpoints,
    endpointsError,
    productionEndpoint,
    problems,
    verdict: problems.length === 0
      ? "✅ Stripe correcto — el webhook debería procesar todos los pagos."
      : `⚠️ ${problems.length} problema(s) detectado(s).`,
  });
}
