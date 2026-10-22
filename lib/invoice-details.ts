export const INVOICE_DETAIL_FIELDS = [
  "clientName", "clientTaxId", "clientAddress", "clientEmail",
  "issuerName", "issuerTaxId", "issuerAddress", "issuerIban",
] as const;
export type InvoiceDetails = Record<typeof INVOICE_DETAIL_FIELDS[number], string>;
export function parseInvoiceDetails(value: unknown): Partial<InvoiceDetails> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Datos fiscales inválidos");
  const result: Partial<InvoiceDetails> = {};
  for (const key of INVOICE_DETAIL_FIELDS) {
    if (!(key in value)) continue;
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw !== "string" || raw.length > 2000) throw new Error("Revisa los datos fiscales (máximo 2000 caracteres por campo)");
    const clean = raw.trim();
    if ((key === "clientName" || key === "issuerName") && !clean) throw new Error("El nombre del cliente y del emisor son obligatorios");
    result[key] = clean;
  }
  return result;
}
