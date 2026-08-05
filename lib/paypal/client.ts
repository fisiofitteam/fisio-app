/**
 * Cliente HTTP para la REST API de PayPal.
 *
 * PayPal deprecó su SDK oficial (`@paypal/checkout-server-sdk`), así que
 * usamos fetch directo contra la REST API. Es más ligero (una dep menos)
 * y nos deja controlar cabeceras/idempotencia con precisión.
 *
 * El flujo básico:
 *   1. Autenticarse: POST /v1/oauth2/token con Basic Auth (client:secret)
 *      → devuelve access_token con validez de ~9 horas.
 *   2. Usar el access_token en `Authorization: Bearer …` para el resto de
 *      llamadas.
 *
 * Cacheamos el token en memoria por proceso hasta ~5 min antes de que
 * expire para no pedir uno nuevo en cada request.
 */
import { paypalBaseUrl, paypalCredentials } from "./config";

let _token: { value: string; expiresAt: number } | null = null;

class PayPalError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * Obtiene un access_token válido (usa cache si aún no expira).
 * Lanza si no hay credenciales o si PayPal rechaza el basic auth.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_token && _token.expiresAt > now + 60_000) {
    return _token.value;
  }
  const creds = paypalCredentials();
  if (!creds) {
    throw new Error(
      "PayPal no está configurado. Falta PAYPAL_CLIENT_ID_* / PAYPAL_CLIENT_SECRET_* en env vars.",
    );
  }
  const basic = Buffer.from(`${creds.clientId}:${creds.secret}`).toString("base64");
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PayPalError(res.status, data, `PayPal auth failed: ${data?.error_description ?? data?.error ?? res.statusText}`);
  }
  const expiresInSec = Number(data.expires_in) || 32_000;
  _token = { value: data.access_token, expiresAt: now + expiresInSec * 1000 };
  return data.access_token;
}

/**
 * Llamada REST genérica autenticada. Añade Bearer, Content-Type JSON,
 * `PayPal-Request-Id` si `idempotencyKey` (idempotencia en Orders API), y
 * parsea la respuesta en JSON. Lanza `PayPalError` con status + body si
 * la respuesta no es 2xx.
 */
export async function paypalFetch<T = any>(
  path: string,
  opts: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    idempotencyKey?: string;
    query?: Record<string, string | number | undefined>;
  } = {},
): Promise<T> {
  const token = await getAccessToken();
  const qs = opts.query
    ? "?" +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const url = `${paypalBaseUrl()}${path}${qs}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["PayPal-Request-Id"] = opts.idempotencyKey;

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    throw new PayPalError(
      res.status,
      data,
      `PayPal ${opts.method ?? "GET"} ${path} → ${res.status}: ${errorSummary(data) ?? res.statusText}`,
    );
  }
  return data as T;
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function errorSummary(body: any): string | null {
  if (!body || typeof body !== "object") return null;
  if (body.message) return String(body.message);
  if (body.details?.[0]?.description) return String(body.details[0].description);
  if (body.error_description) return String(body.error_description);
  return null;
}

export { PayPalError };
