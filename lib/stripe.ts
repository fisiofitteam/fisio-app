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
 * Los Price IDs vienen de variables de entorno para no acoplar el código.
 */
export type ProductCode = "RECUPERA_4M" | "RECUPERA_6M" | "CONSOLIDA_4M" | "CONSOLIDA_6M";

export const PRODUCT_CONFIG: Record<ProductCode, {
  programType: "RECUPERA" | "CONSOLIDA";
  durationMonths: 4 | 6;
  label: string;
  priceEnvKey: string;
}> = {
  RECUPERA_4M: {
    programType: "RECUPERA",
    durationMonths: 4,
    label: "Programa RECUPERA · 4 meses",
    priceEnvKey: "STRIPE_PRICE_RECUPERA_4M",
  },
  RECUPERA_6M: {
    programType: "RECUPERA",
    durationMonths: 6,
    label: "Programa RECUPERA · 6 meses",
    priceEnvKey: "STRIPE_PRICE_RECUPERA_6M",
  },
  CONSOLIDA_4M: {
    programType: "CONSOLIDA",
    durationMonths: 4,
    label: "Programa CONSOLIDA · 4 meses",
    priceEnvKey: "STRIPE_PRICE_CONSOLIDA_4M",
  },
  CONSOLIDA_6M: {
    programType: "CONSOLIDA",
    durationMonths: 6,
    label: "Programa CONSOLIDA · 6 meses",
    priceEnvKey: "STRIPE_PRICE_CONSOLIDA_6M",
  },
};

/**
 * Obtiene el Stripe Price ID para un productCode dado desde env vars.
 * Devuelve null si no está configurado.
 */
export function getPriceIdForProduct(code: ProductCode): string | null {
  const config = PRODUCT_CONFIG[code];
  if (!config) return null;
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
