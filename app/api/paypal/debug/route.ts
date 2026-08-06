/**
 * GET /api/paypal/debug — diagnóstico rápido de configuración PayPal.
 * Solo CEO. Devuelve:
 *   - qué env vars están presentes (sí/no)
 *   - los últimos 6 caracteres del client_id y secret cargados (para
 *     comparar visualmente sin exponer el valor entero)
 *   - resultado de la llamada real de OAuth a PayPal (SUCCESS o error)
 *
 * Se usa una vez para depurar cuando el pago falla con "Client
 * Authentication failed". Se puede borrar en Fase 4 cuando la migración
 * esté cerrada.
 */
import { NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { paypalBaseUrl, paypalCredentials, paypalMode, paypalWebhookId } from "@/lib/paypal/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tail(v: string | undefined | null, n = 6): string {
  if (!v) return "(vacío)";
  if (v.length <= n) return v;
  return "…" + v.slice(-n);
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const mode = paypalMode();
  const creds = paypalCredentials();
  const webhookId = paypalWebhookId();
  const clientIdRaw = mode === "live" ? process.env.PAYPAL_CLIENT_ID_LIVE : process.env.PAYPAL_CLIENT_ID_SANDBOX;
  const secretRaw = mode === "live" ? process.env.PAYPAL_CLIENT_SECRET_LIVE : process.env.PAYPAL_CLIENT_SECRET_SANDBOX;

  const report: any = {
    mode,
    paypalBase: paypalBaseUrl(),
    envVarsPresent: {
      PAYPAL_MODE: !!process.env.PAYPAL_MODE,
      PAYPAL_CLIENT_ID_SANDBOX: !!process.env.PAYPAL_CLIENT_ID_SANDBOX,
      PAYPAL_CLIENT_SECRET_SANDBOX: !!process.env.PAYPAL_CLIENT_SECRET_SANDBOX,
      PAYPAL_CLIENT_ID_LIVE: !!process.env.PAYPAL_CLIENT_ID_LIVE,
      PAYPAL_CLIENT_SECRET_LIVE: !!process.env.PAYPAL_CLIENT_SECRET_LIVE,
      PAYPAL_WEBHOOK_ID_SANDBOX: !!process.env.PAYPAL_WEBHOOK_ID_SANDBOX,
      PAYPAL_WEBHOOK_ID_LIVE: !!process.env.PAYPAL_WEBHOOK_ID_LIVE,
    },
    active: {
      clientIdLength: clientIdRaw?.length ?? 0,
      clientIdTail: tail(clientIdRaw),
      secretLength: secretRaw?.length ?? 0,
      secretTail: tail(secretRaw),
      webhookIdTail: tail(webhookId),
    },
  };

  if (!creds) {
    report.oauth = { status: "SKIPPED", reason: "credenciales incompletas" };
    return NextResponse.json(report);
  }

  // Prueba real de OAuth para dar el mensaje exacto de PayPal.
  try {
    const basic = Buffer.from(`${creds.clientId}:${creds.secret}`).toString("base64");
    const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: "grant_type=client_credentials",
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      report.oauth = { status: "SUCCESS", tokenType: body.token_type, expiresIn: body.expires_in };
    } else {
      report.oauth = {
        status: "FAIL",
        httpStatus: res.status,
        error: body.error,
        errorDescription: body.error_description,
      };
    }
  } catch (e: any) {
    report.oauth = { status: "FAIL", reason: e?.message ?? "unknown" };
  }

  return NextResponse.json(report);
}
