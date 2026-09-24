/**
 * GET /api/admin/paypal-config-check
 *
 * Diagnóstico rápido de la configuración de PayPal para saber si la app
 * de PayPal Developer que estamos viendo (Client ID) coincide con la que
 * usa la app en producción. Muestra solo prefijos, nunca el valor entero.
 *
 * Uso: entra logueado como CEO en:
 *   https://app.fisiofitteam.com/api/admin/paypal-config-check
 * Y compara los prefijos con lo que ves en el dashboard de PayPal Developer.
 *
 * Solo CEO. No expone secretos.
 */
import { NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { paypalMode, paypalCredentials, paypalWebhookId, paypalBaseUrl } from "@/lib/paypal/config";
import { getAccessToken, paypalFetch } from "@/lib/paypal/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function prefix(v: string | null | undefined, n = 10): string | null {
  if (!v) return null;
  return v.slice(0, n) + (v.length > n ? "…" : "");
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Login requerido" }, { status: 401 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Solo CEO" }, { status: 403 });

  const creds = paypalCredentials();
  const webhookId = paypalWebhookId();
  const mode = paypalMode();

  // Autenticación de prueba: si las credenciales están mal, esto lanza.
  let authResult: { ok: boolean; error?: string } = { ok: false };
  try {
    await getAccessToken();
    authResult = { ok: true };
  } catch (e: any) {
    authResult = { ok: false, error: e?.message ?? String(e) };
  }

  // Listar webhooks realmente configurados en la app de PayPal.
  let webhooks: Array<{
    id: string;
    url: string;
    idPrefix: string;
    matchesEnv: boolean;
    eventTypes: string[];
    missingCritical: string[];
  }> = [];
  const CRITICAL_EVENTS = [
    "PAYMENT.CAPTURE.COMPLETED",
    "PAYMENT.CAPTURE.DENIED",
    "PAYMENT.CAPTURE.REFUNDED",
    "BILLING.SUBSCRIPTION.ACTIVATED",
    "BILLING.SUBSCRIPTION.CANCELLED",
    "BILLING.SUBSCRIPTION.SUSPENDED",
    "BILLING.SUBSCRIPTION.EXPIRED",
    "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
    "PAYMENT.SALE.COMPLETED",
  ];
  let webhookListError: string | null = null;
  if (authResult.ok) {
    try {
      const list = await paypalFetch<{ webhooks?: Array<{ id: string; url: string; event_types?: Array<{ name: string }> }> }>(
        "/v1/notifications/webhooks",
      );
      webhooks = (list.webhooks ?? []).map((w) => {
        const eventNames = (w.event_types ?? []).map((et) => et.name);
        const missing = CRITICAL_EVENTS.filter((ce) => !eventNames.includes(ce) && !eventNames.includes("*"));
        return {
          id: w.id,
          idPrefix: w.id.slice(0, 12) + (w.id.length > 12 ? "…" : ""),
          url: w.url,
          matchesEnv: !!webhookId && w.id === webhookId,
          eventTypes: eventNames,
          missingCritical: missing,
        };
      });
    } catch (e: any) {
      webhookListError = e?.message ?? String(e);
    }
  }

  const matchingWebhook = webhooks.find((w) => w.matchesEnv);

  const problems: string[] = [];
  if (mode === "sandbox") problems.push("Modo SANDBOX — los pagos reales necesitan LIVE.");
  if (!authResult.ok) problems.push(`Autenticación PayPal FALLA: ${authResult.error}`);
  if (!webhookId) problems.push("PAYPAL_WEBHOOK_ID_LIVE no configurado en Vercel.");
  if (authResult.ok && webhooks.length === 0) problems.push("La app de PayPal no tiene NINGÚN webhook configurado.");
  if (authResult.ok && webhookId && !matchingWebhook) {
    problems.push(`El PAYPAL_WEBHOOK_ID_LIVE ("${prefix(webhookId, 12)}") no aparece en la lista de webhooks de esta app.`);
  }
  if (matchingWebhook && matchingWebhook.missingCritical.length > 0) {
    problems.push(
      `Al webhook le faltan ${matchingWebhook.missingCritical.length} eventos críticos: ${matchingWebhook.missingCritical.join(", ")}`,
    );
  }

  return NextResponse.json({
    mode,
    baseUrl: paypalBaseUrl(),
    envVars: {
      clientIdPrefix: prefix(creds?.clientId ?? null, 12),
      clientIdLength: creds?.clientId?.length ?? 0,
      secretConfigured: !!creds?.secret,
      webhookIdPrefix: prefix(webhookId, 12),
      webhookIdLength: webhookId?.length ?? 0,
      names: {
        clientId: mode === "live" ? "PAYPAL_CLIENT_ID_LIVE" : "PAYPAL_CLIENT_ID_SANDBOX",
        secret: mode === "live" ? "PAYPAL_CLIENT_SECRET_LIVE" : "PAYPAL_CLIENT_SECRET_SANDBOX",
        webhookId: mode === "live" ? "PAYPAL_WEBHOOK_ID_LIVE" : "PAYPAL_WEBHOOK_ID_SANDBOX",
      },
    },
    auth: authResult,
    webhooks,
    webhookListError,
    matchingWebhookInEnv: matchingWebhook ? { id: matchingWebhook.idPrefix, url: matchingWebhook.url } : null,
    problems,
    verdict: problems.length === 0
      ? "✅ Todo correcto — el webhook debería recibir eventos."
      : `⚠️ ${problems.length} problema(s) detectado(s).`,
  });
}
