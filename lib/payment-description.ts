/** Keep provider reconciliation metadata in storage, outside the displayed label. */
export function paymentDescription(description: string | null): string | null {
  return description?.replace(/\s*\[ff-receipt:v1\s[^\]]*\]/g, "").trim() || null;
}
