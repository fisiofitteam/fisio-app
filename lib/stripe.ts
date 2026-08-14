/**
 * Singleton de Stripe SDK + helpers comunes.
 *
 * Toda la app debe importar `stripe` de aquí, no instanciar `new Stripe(...)`
 * directamente, para mantener una sola instancia y centralizar configuración.
 */
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey && process.env.NODE_ENV === "production") {
  console.warn("[stripe] STRIPE_SECRET_KEY not configured");
}

export const stripe = secretKey
  ? new Stripe(secretKey, { apiVersion: "2024-06-20" as any })
  : null;

/**
 * Mapeo entre el productCode interno y el Price ID de Stripe.
 *
 * Solo 4M y 6M tienen Price ID configurado en Stripe (venta habitual). Las
 * demás duraciones (1,2,3,5,7,8,9,10,11,12) son válidas pero requieren que
 * el CEO teclee el importe al generar el link — no hay precio "sugerido"
 * que consultar. Cualquier duración de 1 a 12 meses es aceptable.
 */
export type ProgramTypeCode = "RECUPERA" | "CONSOLIDA";
export type DurationMonths = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type ProductCode = `${ProgramTypeCode}_${DurationMonths}M`;

export const ALL_DURATIONS: DurationMonths[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

type ProductConfigEntry = {
  programType: ProgramTypeCode;
  durationMonths: DurationMonths;
  label: string;
  priceEnvKey: string | null;
};

function buildProductConfig(): Record<ProductCode, ProductConfigEntry> {
  const out = {} as Record<ProductCode, ProductConfigEntry>;
  for (const program of ["RECUPERA", "CONSOLIDA"] as const) {
    for (const months of ALL_DURATIONS) {
      const code = `${program}_${months}M` as ProductCode;
      out[code] = {
        programType: program,
        durationMonths: months,
        label: `Programa ${program} · ${months} ${months === 1 ? "mes" : "meses"}`,
        // Solo 4M y 6M tienen priceId fijo en Stripe; el resto usa precio custom del CEO.
        priceEnvKey: months === 4 || months === 6 ? `STRIPE_PRICE_${program}_${months}M` : null,
      };
    }
  }
  return out;
}

export const PRODUCT_CONFIG = buildProductConfig();

/**
 * Obtiene el Stripe Price ID para un productCode dado desde env vars.
 * Devuelve null si no está configurado (duraciones custom sin priceId fijo).
 */
export function getPriceIdForProduct(code: ProductCode): string | null {
  const config = PRODUCT_CONFIG[code];
  if (!config || !config.priceEnvKey) return null;
  return process.env[config.priceEnvKey] || null;
}

/**
 * Genera un token seguro para el link de pago (32 caracteres aleatorios).
 * Usado en /pagar/[token].
 */
export function generatePaymentToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ────────────────────────────────────────────────────────────────────────────
// FisioFit Prevention: planes recurrentes + consulta puntual
// ────────────────────────────────────────────────────────────────────────────
// A diferencia de RECUPERA/CONSOLIDA (one-shot con acceso finito), Prevention
// es una suscripción recurrente vía Stripe Subscriptions. Tres planes con
// intervalos distintos + una consulta 45 min con la CEO como upsell one-shot.

export type PreventionPlan = "quarterly" | "semiannual" | "annual";

export const PREVENTION_PLAN_CONFIG: Record<PreventionPlan, {
  label: string;
  months: number;
  amountCents: number;               // importe facturado por periodo
  monthlyEffectiveCents: number;     // €/mes efectivo (para copy comercial)
  intervalMonths: number;            // longitud del ciclo de facturación
  priceEnvKey: string;
  isHighlighted: boolean;            // el semestral lleva el badge "el más elegido"
}> = {
  quarterly: {
    label: "Trimestral",
    months: 3,
    amountCents: 8700,
    monthlyEffectiveCents: 2900,
    intervalMonths: 3,
    priceEnvKey: "STRIPE_PRICE_PREVENTION_QUARTERLY",
    isHighlighted: false,
  },
  semiannual: {
    label: "Semestral",
    months: 6,
    amountCents: 11900,
    monthlyEffectiveCents: 1983, // 119 / 6
    intervalMonths: 6,
    priceEnvKey: "STRIPE_PRICE_PREVENTION_SEMIANNUAL",
    isHighlighted: true,
  },
  annual: {
    label: "Anual",
    months: 12,
    amountCents: 19900,
    monthlyEffectiveCents: 1658, // 199 / 12
    intervalMonths: 12,
    priceEnvKey: "STRIPE_PRICE_PREVENTION_ANNUAL",
    isHighlighted: false,
  },
};

/** Días de prueba gratuita al arrancar una suscripción Prevention nueva. */
export const PREVENTION_TRIAL_DAYS = 4;

export function isPreventionPlan(x: unknown): x is PreventionPlan {
  return x === "quarterly" || x === "semiannual" || x === "annual";
}

export function getPreventionPriceId(plan: PreventionPlan): string | null {
  const cfg = PREVENTION_PLAN_CONFIG[plan];
  if (!cfg) return null;
  return process.env[cfg.priceEnvKey] || null;
}
