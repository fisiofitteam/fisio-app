/**
 * Refunds y cancelaciones de suscripción en PayPal.
 *
 * Docs:
 *  - Refund capture: https://developer.paypal.com/docs/api/payments/v2/#captures_refund
 *  - Cancel subscription: https://developer.paypal.com/docs/api/subscriptions/v1/#subscriptions_cancel
 *
 * Ambas operaciones son idempotentes desde el punto de vista del negocio:
 *  - Un capture ya refundeado responde 422 con detalle "CAPTURE_FULLY_REFUNDED".
 *  - Una subscription ya cancelada responde 422 con "SUBSCRIPTION_STATUS_INVALID".
 * En el flujo del panel tratamos esos casos como éxito silencioso, porque
 * significan que el estado deseado ya se ha alcanzado (probablemente el CEO
 * ya lo había hecho a mano en el dashboard de PayPal).
 */
import { paypalFetch, PayPalError } from "./client";

export type RefundResult = {
  ok: boolean;
  alreadyDone: boolean;   // true si PayPal responde que ya estaba refundeado
  paypalRefundId?: string;
  error?: string;
};

/**
 * Reembolso total de un capture PayPal (one-shot). Para suscripciones que ya
 * han cobrado, cada cobro es un capture distinto — hay que refundear cada uno
 * por separado si se quiere devolver todo el histórico.
 */
export async function refundCapture(captureId: string, reason: string): Promise<RefundResult> {
  try {
    const body = { note_to_payer: reason.slice(0, 255) };
    const res = await paypalFetch<{ id: string; status: string }>(
      `/v2/payments/captures/${captureId}/refund`,
      { method: "POST", body },
    );
    return { ok: true, alreadyDone: false, paypalRefundId: res.id };
  } catch (err) {
    if (err instanceof PayPalError) {
      // 422 con detalle CAPTURE_FULLY_REFUNDED = ya estaba refundeado
      const bodyStr = JSON.stringify(err.body ?? {});
      if (bodyStr.includes("CAPTURE_FULLY_REFUNDED") || bodyStr.includes("ALREADY_REFUNDED")) {
        return { ok: true, alreadyDone: true };
      }
      return { ok: false, alreadyDone: false, error: err.message };
    }
    return { ok: false, alreadyDone: false, error: (err as Error).message };
  }
}

export type CancelResult = {
  ok: boolean;
  alreadyDone: boolean; // true si la sub ya estaba cancelada
  error?: string;
};

/**
 * Cancela una subscripción PayPal. Idempotente: si ya estaba cancelada,
 * PayPal responde 422 y lo tratamos como éxito.
 */
export async function cancelSubscription(subscriptionId: string, reason: string): Promise<CancelResult> {
  try {
    await paypalFetch(
      `/v1/billing/subscriptions/${subscriptionId}/cancel`,
      { method: "POST", body: { reason: reason.slice(0, 128) } },
    );
    return { ok: true, alreadyDone: false };
  } catch (err) {
    if (err instanceof PayPalError) {
      const bodyStr = JSON.stringify(err.body ?? {});
      // SUBSCRIPTION_STATUS_INVALID = ya cancelada / suspendida / expirada
      if (bodyStr.includes("SUBSCRIPTION_STATUS_INVALID") || err.status === 404) {
        return { ok: true, alreadyDone: true };
      }
      return { ok: false, alreadyDone: false, error: err.message };
    }
    return { ok: false, alreadyDone: false, error: (err as Error).message };
  }
}
