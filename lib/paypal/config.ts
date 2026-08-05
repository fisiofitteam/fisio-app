/**
 * Config y detección de modo PayPal (sandbox / live).
 *
 * `PAYPAL_MODE` env var decide el ambiente:
 *  - "sandbox" (default): usa credenciales de sandbox, se pega contra
 *    api-m.sandbox.paypal.com. Cero riesgo de dinero real.
 *  - "live": usa credenciales de producción, api-m.paypal.com.
 *
 * Convención de env vars — dos pares distintos así podemos tener las dos
 * activas en Vercel sin colisión, y solo cambiando PAYPAL_MODE saltamos
 * de un ambiente a otro:
 *  - PAYPAL_CLIENT_ID_SANDBOX / PAYPAL_CLIENT_SECRET_SANDBOX
 *  - PAYPAL_CLIENT_ID_LIVE    / PAYPAL_CLIENT_SECRET_LIVE
 *
 * También lee PAYPAL_WEBHOOK_ID_SANDBOX / PAYPAL_WEBHOOK_ID_LIVE para la
 * verificación de firma del webhook (el ID lo obtenemos al registrar el
 * webhook en el dashboard de PayPal, no coincide con las credenciales).
 */

export type PayPalMode = "sandbox" | "live";

export function paypalMode(): PayPalMode {
  const raw = (process.env.PAYPAL_MODE ?? "sandbox").toLowerCase();
  return raw === "live" ? "live" : "sandbox";
}

export function paypalBaseUrl(): string {
  return paypalMode() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function paypalCredentials(): { clientId: string; secret: string } | null {
  const mode = paypalMode();
  const clientId =
    mode === "live" ? process.env.PAYPAL_CLIENT_ID_LIVE : process.env.PAYPAL_CLIENT_ID_SANDBOX;
  const secret =
    mode === "live" ? process.env.PAYPAL_CLIENT_SECRET_LIVE : process.env.PAYPAL_CLIENT_SECRET_SANDBOX;
  if (!clientId || !secret) return null;
  return { clientId, secret };
}

export function paypalWebhookId(): string | null {
  const mode = paypalMode();
  return (
    (mode === "live" ? process.env.PAYPAL_WEBHOOK_ID_LIVE : process.env.PAYPAL_WEBHOOK_ID_SANDBOX) ?? null
  );
}

/** URL pública de la app (para redirect después del pago). */
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || "https://app.fisiofitteam.com";
}
