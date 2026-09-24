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
import { paypalMode, paypalCredentials, paypalWebhookId } from "@/lib/paypal/config";

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

  return NextResponse.json({
    mode: paypalMode(),
    clientIdPrefix: prefix(creds?.clientId ?? null, 12),
    clientIdLength: creds?.clientId?.length ?? 0,
    secretConfigured: !!creds?.secret,
    webhookIdPrefix: prefix(webhookId, 12),
    webhookIdLength: webhookId?.length ?? 0,
    envVarUsed: {
      clientId: paypalMode() === "live" ? "PAYPAL_CLIENT_ID_LIVE" : "PAYPAL_CLIENT_ID_SANDBOX",
      secret: paypalMode() === "live" ? "PAYPAL_CLIENT_SECRET_LIVE" : "PAYPAL_CLIENT_SECRET_SANDBOX",
      webhookId: paypalMode() === "live" ? "PAYPAL_WEBHOOK_ID_LIVE" : "PAYPAL_WEBHOOK_ID_SANDBOX",
    },
    hint:
      paypalMode() === "sandbox"
        ? "⚠️ Estás en SANDBOX. Los pagos reales necesitan mode=live."
        : creds
          ? webhookId
            ? "OK: credenciales y webhookId configurados."
            : "⚠️ Falta PAYPAL_WEBHOOK_ID_LIVE. Los eventos del webhook no se verifican."
          : "⚠️ Faltan credenciales PayPal en Vercel.",
  });
}
