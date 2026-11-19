type Referrer = { fullName: string } | null;

export function LeadReferralNotice({
  referrer,
  source,
}: {
  referrer: Referrer;
  source: string | null;
}) {
  if (!referrer && source !== "referral") return null;

  return (
    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Referido</span>
        <span>{referrer ? `Recomendado por ${referrer.fullName}` : "Recomendador no disponible"}</span>
      </div>
      <p className="mt-1">50 € de descuento en su primer programa. Aplicar el precio personalizado al preparar la venta.</p>
    </div>
  );
}
