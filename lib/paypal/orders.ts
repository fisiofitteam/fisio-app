/**
 * Helpers para PayPal Orders API v2 (pagos de una sola vez con opción
 * "Pay in 3/4" habilitada automáticamente para clientes elegibles).
 *
 * Docs: https://developer.paypal.com/docs/api/orders/v2/
 */
import { paypalFetch } from "./client";

export type CreateOrderInput = {
  /** Cadena única para idempotencia (ej. saleId interno). Evita duplicar cargos si la request se reintenta. */
  requestId: string;
  /** Importe total en euros. Ej: 495.00 */
  amountEur: number;
  /** Descripción legible (aparece en el checkout y en el histórico PayPal). */
  description: string;
  /** URL a la que redirigir tras aprobar el pago. */
  returnUrl: string;
  /** URL a la que redirigir si el cliente cancela. */
  cancelUrl: string;
  /**
   * `custom_id` que PayPal devuelve tal cual en el webhook y en la
   * respuesta de captura. Nosotros lo usamos para atar el Order con
   * nuestro `Sale.id` interno y saber qué renovación/paciente activar.
   */
  customId: string;
  /**
   * Etiqueta corta que aparece en la referencia interna de PayPal
   * (max 127 chars). Ej: "FisioFit RECUPERA 4m".
   */
  referenceLabel?: string;
  /**
   * Idioma de la interfaz PayPal en el checkout. Default es-ES.
   */
  locale?: "es-ES" | "en-US";
};

export type CreateOrderResult = {
  id: string;
  status: string;
  /** URL a la que redirigimos al cliente para que apruebe el pago. */
  approveUrl: string;
  raw: any;
};

/**
 * Crea una Order de pago único con Pay Later habilitado (banner "Paga
 * en 3 plazos sin intereses" si el cliente califica).
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const amount = input.amountEur.toFixed(2);
  const body: any = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: input.referenceLabel?.slice(0, 127) ?? "default",
        custom_id: input.customId.slice(0, 127),
        description: input.description.slice(0, 127),
        amount: {
          currency_code: "EUR",
          value: amount,
        },
      },
    ],
    application_context: {
      brand_name: "FisioFit Team",
      locale: input.locale ?? "es-ES",
      landing_page: "NO_PREFERENCE",
      user_action: "PAY_NOW",
      shipping_preference: "NO_SHIPPING",
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
    },
    // Habilitar Pay Later explícitamente: PayPal muestra el banner de
    // fraccionamiento a los usuarios elegibles del país destino.
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "FisioFit Team",
          locale: input.locale ?? "es-ES",
          landing_page: "NO_PREFERENCE",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
          payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
        },
      },
    },
  };

  const data = await paypalFetch<any>("/v2/checkout/orders", {
    method: "POST",
    body,
    idempotencyKey: input.requestId,
  });

  const approveUrl = (data.links ?? []).find(
    (l: any) => l.rel === "approve" || l.rel === "payer-action",
  )?.href;
  if (!approveUrl) {
    throw new Error("PayPal creó la Order pero no devolvió approve URL.");
  }
  return {
    id: data.id,
    status: data.status,
    approveUrl,
    raw: data,
  };
}

/**
 * Captura una Order previamente aprobada. Se llama al volver al
 * `returnUrl` después del checkout — PayPal manda al usuario con
 * ?token=<orderId>&PayerID=<payer>.
 *
 * Si el pago se hizo con Pay Later, la primera capture ya ocurre aquí
 * (PayPal financia el resto entre bastidores).
 */
export async function captureOrder(orderId: string): Promise<any> {
  return await paypalFetch<any>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
  });
}

/**
 * Consulta el estado actual de una Order (usado para reconciliación o
 * cuando el usuario vuelve al `returnUrl` pero no hicimos capture por
 * error / carrera).
 */
export async function getOrder(orderId: string): Promise<any> {
  return await paypalFetch<any>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}
