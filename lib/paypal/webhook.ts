/**
 * Verificación de firma de webhooks de PayPal.
 *
 * PayPal no usa una firma HMAC como Stripe. En su lugar, delegamos la
 * verificación a su propio endpoint: enviamos las cabeceras + el body
 * + el webhook_id (obtenido al registrar el webhook en el dashboard)
 * y PayPal nos dice si la firma es válida (verification_status="SUCCESS").
 *
 * Docs: https://developer.paypal.com/api/rest/webhooks/rest/
 */
import { paypalFetch } from "./client";
import { paypalWebhookId } from "./config";

type VerifyInput = {
  headers: Headers;
  /** Body raw parseado como JSON. */
  event: any;
};

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Verifica una notificación de PayPal. Devuelve `{ ok: true }` si la firma
 * es válida, o `{ ok: false, reason }` si no. No lanza.
 */
export async function verifyWebhookSignature({ headers, event }: VerifyInput): Promise<VerifyResult> {
  const webhookId = paypalWebhookId();
  if (!webhookId) {
    return { ok: false, reason: "PAYPAL_WEBHOOK_ID_* no configurado" };
  }
  const transmission_id = headers.get("paypal-transmission-id");
  const transmission_time = headers.get("paypal-transmission-time");
  const cert_url = headers.get("paypal-cert-url");
  const auth_algo = headers.get("paypal-auth-algo");
  const transmission_sig = headers.get("paypal-transmission-sig");
  if (!transmission_id || !transmission_time || !cert_url || !auth_algo || !transmission_sig) {
    return { ok: false, reason: "Falta alguna cabecera PayPal-*" };
  }

  try {
    const res = await paypalFetch<{ verification_status: string }>(
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: {
          auth_algo,
          cert_url,
          transmission_id,
          transmission_sig,
          transmission_time,
          webhook_id: webhookId,
          webhook_event: event,
        },
      },
    );
    if (res.verification_status === "SUCCESS") return { ok: true };
    return { ok: false, reason: `verification_status=${res.verification_status}` };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? "Error llamando a verify-webhook-signature" };
  }
}
