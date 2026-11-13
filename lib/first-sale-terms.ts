/** Monetary contract in integer cents. Any remainder is collected once, in the first monthly payment. */
export function firstInstallments(totalCents: number, n: number) {
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < 1 ||
    !Number.isInteger(n) ||
    n < 1 ||
    n > 12
  )
    throw Error("Importe o número de cuotas no válido.");
  const regularCents = Math.floor(totalCents / n),
    remainderCents = totalCents - regularCents * n;
  return {
    regularCents,
    firstCents: regularCents + remainderCents,
    remainderCents,
  };
}
export function stripeFirstPaymentMatches(
  sale: {
    id: string;
    paymentToken: string;
    paymentProvider: string;
    amountCents: number;
    currency: string;
    installmentCount: number | null;
    stripeSessionId: string | null;
  },
  session: {
    id: string;
    payment_status: string;
    metadata: Record<string, string> | null;
    amount_total: number | null;
    currency: string | null;
    mode: string | null;
  },
) {
  return (
    sale.paymentProvider === "stripe" &&
    session.payment_status === "paid" &&
    session.metadata?.saleId === sale.id &&
    session.metadata?.paymentToken === sale.paymentToken &&
    (!sale.stripeSessionId || sale.stripeSessionId === session.id) &&
    session.currency?.toLowerCase() === sale.currency.toLowerCase() &&
    session.mode === (sale.installmentCount ? "subscription" : "payment") &&
    session.amount_total ===
      firstInstallments(sale.amountCents, sale.installmentCount || 1).firstCents
  );
}
