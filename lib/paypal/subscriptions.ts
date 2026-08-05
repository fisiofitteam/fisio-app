/**
 * Helpers para PayPal Subscriptions API (cobros recurrentes con N ciclos).
 *
 * Modelo PayPal:
 *   Product  → describe "qué se vende" (reutilizable, ej. "FisioFit Alta")
 *   Plan     → precio + frecuencia + total_cycles (nuevo por cada venta)
 *   Subscription → instancia para un cliente concreto (approve URL para el checkout)
 *
 * Para nuestra Fase 2 (N cuotas mensuales del mismo importe) creamos:
 *   - 1 Product global cacheado (id guardado en env o creado on-demand)
 *   - 1 Plan nuevo por Sale (N cycles × importe/N, frecuencia MONTH)
 *   - 1 Subscription por Sale
 *
 * Docs: https://developer.paypal.com/docs/api/subscriptions/v1/
 */
import { paypalFetch } from "./client";

// ─── Product ──────────────────────────────────────────────────────────────

/**
 * Crea el Product genérico "FisioFit Alta" en PayPal. Solo hay que llamarlo
 * una vez por entorno (sandbox/live). Devuelve el `id` que hay que guardar
 * en `PAYPAL_PRODUCT_ID_SANDBOX` / `PAYPAL_PRODUCT_ID_LIVE` para reutilizar
 * en todas las suscripciones.
 *
 * Si `PAYPAL_PRODUCT_ID_*` ya está seteado en env, no hace falta llamar a
 * esto — `ensureProductId()` lo usa directamente.
 */
export async function createProduct(input: {
  name: string;
  description?: string;
}): Promise<{ id: string; raw: any }> {
  // `category` debe ser una MerchantCategory reconocida por PayPal (enum
  // cerrada). "HEALTH_AND_BEAUTY_SPAS" y "MEDICAL_SERVICES" son válidos;
  // usamos "FITNESS_AND_RECREATIONAL_SPORTS_CENTERS" que encaja mejor con
  // programas de fisioterapia deportiva.
  const body = {
    name: input.name.slice(0, 127),
    description: input.description?.slice(0, 256) ?? undefined,
    type: "SERVICE",
    category: "FITNESS_AND_RECREATIONAL_SPORTS_CENTERS",
  };
  const data = await paypalFetch<any>("/v1/catalogs/products", {
    method: "POST",
    body,
  });
  return { id: data.id, raw: data };
}

let _cachedProductId: string | null = null;

/**
 * Devuelve el Product ID a usar para todas las suscripciones. Si hay uno en
 * env, lo devuelve directamente. Si no, crea uno on-demand y lo cachea
 * en memoria (aunque conviene guardarlo también en env para no depender de
 * memoria por proceso).
 */
export async function ensureProductId(): Promise<string> {
  if (_cachedProductId) return _cachedProductId;
  const mode = process.env.PAYPAL_MODE === "live" ? "LIVE" : "SANDBOX";
  const envKey = `PAYPAL_PRODUCT_ID_${mode}`;
  const fromEnv = process.env[envKey];
  if (fromEnv) {
    _cachedProductId = fromEnv;
    return fromEnv;
  }
  const created = await createProduct({
    name: "FisioFit Alta",
    description: "Programa de fisioterapia y readaptación deportiva de FisioFit Team.",
  });
  _cachedProductId = created.id;
  console.warn(
    `[paypal] Product creado on-demand (${created.id}). Guárdalo en ${envKey} para reutilizarlo.`,
  );
  return created.id;
}

// ─── Plan ─────────────────────────────────────────────────────────────────

export type CreatePlanInput = {
  /** Idempotencia. Usa saleId. */
  requestId: string;
  /** Nombre visible en el checkout (max 127). */
  name: string;
  /** Importe TOTAL en euros (se divide entre `totalCycles` para el cobro mensual). */
  totalAmountEur: number;
  /** Número de cuotas mensuales (2..12). */
  totalCycles: number;
};

/**
 * Crea un Plan de N cobros mensuales del mismo importe. `total_cycles` >0
 * limita la suscripción a N cobros — PayPal la marca como COMPLETED al
 * terminar. Sin ciclos infinitos.
 */
export async function createPlan(input: CreatePlanInput): Promise<{
  id: string;
  status: string;
  perCycleAmount: number;
  raw: any;
}> {
  if (input.totalCycles < 2 || input.totalCycles > 12) {
    throw new Error(`totalCycles debe estar entre 2 y 12 (recibido ${input.totalCycles})`);
  }
  const productId = await ensureProductId();
  // Redondeamos a 2 decimales; el pequeño desajuste por redondeo (< 1 cent
  // acumulado) es aceptable y PayPal lo tolera.
  const perCycle = Math.round((input.totalAmountEur * 100) / input.totalCycles) / 100;

  const body: any = {
    product_id: productId,
    name: input.name.slice(0, 127),
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: input.totalCycles,
        pricing_scheme: {
          fixed_price: {
            value: perCycle.toFixed(2),
            currency_code: "EUR",
          },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: "0", currency_code: "EUR" },
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 2,
    },
  };

  const data = await paypalFetch<any>("/v1/billing/plans", {
    method: "POST",
    body,
    idempotencyKey: input.requestId,
  });
  return {
    id: data.id,
    status: data.status,
    perCycleAmount: perCycle,
    raw: data,
  };
}

// ─── Subscription ─────────────────────────────────────────────────────────

export type CreateSubscriptionInput = {
  /** Idempotencia. Usa saleId. */
  requestId: string;
  /** ID del Plan recién creado. */
  planId: string;
  /**
   * `custom_id` que PayPal devuelve en el webhook. Nosotros usamos
   * paymentToken interno para localizar el Sale.
   */
  customId: string;
  /** URL a la que redirigir tras aprobar. */
  returnUrl: string;
  /** URL a la que redirigir si cancela. */
  cancelUrl: string;
  /** Idioma del checkout. */
  locale?: "es-ES" | "en-US";
};

/**
 * Crea la Subscription y devuelve la approve URL a la que redirigir al
 * cliente para autorizar los N cobros mensuales.
 */
export async function createSubscription(input: CreateSubscriptionInput): Promise<{
  id: string;
  status: string;
  approveUrl: string;
  raw: any;
}> {
  const body: any = {
    plan_id: input.planId,
    custom_id: input.customId.slice(0, 127),
    application_context: {
      brand_name: "FisioFit Team",
      locale: input.locale ?? "es-ES",
      user_action: "SUBSCRIBE_NOW",
      shipping_preference: "NO_SHIPPING",
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
      payment_method: {
        payer_selected: "PAYPAL",
        payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED",
      },
    },
  };

  const data = await paypalFetch<any>("/v1/billing/subscriptions", {
    method: "POST",
    body,
    idempotencyKey: input.requestId,
  });
  const approveUrl = (data.links ?? []).find(
    (l: any) => l.rel === "approve" || l.rel === "payer-action",
  )?.href;
  if (!approveUrl) {
    throw new Error("PayPal creó la Subscription pero no devolvió approve URL.");
  }
  return {
    id: data.id,
    status: data.status,
    approveUrl,
    raw: data,
  };
}

/** Consulta el estado actual de una suscripción (para reconciliación). */
export async function getSubscription(subscriptionId: string): Promise<any> {
  return await paypalFetch<any>(
    `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
}
