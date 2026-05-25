"use client";

import type { SalaryResult } from "@/lib/compensation";

function eur(n: number): string {
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
}

type Emisor = { name: string; taxId: string | null; address: string | null; iban: string | null; email: string | null };
type Receptor = { name: string; taxId: string | null; address: string | null };

export function InvoiceClient({
  emisor,
  receptor,
  vatExempt,
  year,
  month,
  salary,
}: {
  emisor: Emisor;
  receptor: Receptor;
  vatExempt: boolean;
  year: number;
  month: number;
  salary: SalaryResult;
}) {
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  const today = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  const c = salary.config;
  const b = salary.breakdown;

  const lines: { concept: string; detail: string; amount: number }[] = [];
  if (c.baseSalary > 0) lines.push({ concept: "Sueldo fijo", detail: "Mensual", amount: b.fixed });
  if (c.perActivePatient > 0) lines.push({ concept: "Pacientes activos", detail: `${salary.activePatients} × ${eur(c.perActivePatient)}`, amount: b.patients });
  if (c.renewalOwnPct > 0 || c.renewalOthersPct > 0) {
    const parts: string[] = [];
    if (c.renewalOwnPct > 0) parts.push(`${c.renewalOwnPct}% de ${eur(salary.renewalOwnRevenue)} (propias)`);
    if (c.renewalOthersPct > 0) parts.push(`${c.renewalOthersPct}% de ${eur(salary.renewalOthersRevenue)} (equipo)`);
    lines.push({ concept: "Comisión por renovaciones", detail: parts.join(" + "), amount: b.renewals });
  }
  if (c.newSaleCommissionPct > 0) lines.push({ concept: "Comisión por ventas nuevas", detail: `${c.newSaleCommissionPct}% de ${eur(salary.newSaleRevenue)}`, amount: b.newSales });

  const base = salary.total;
  const VAT_RATE = 21;
  const ivaAmount = vatExempt ? 0 : base * (VAT_RATE / 100);
  const totalConIva = base + ivaAmount;

  return (
    <div className="bg-white text-neutral-900 min-h-screen">
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>

      <div className="no-print sticky top-0 bg-neutral-50 border-b border-neutral-200 px-4 py-3 flex justify-between items-center">
        <a href="/fisio" className="text-sm text-neutral-500 hover:underline">← Volver</a>
        <button onClick={() => window.print()} className="btn btn-primary text-sm">🖨️ Imprimir / Guardar PDF</button>
      </div>

      <div className="max-w-2xl mx-auto px-8 py-10">
        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="text-2xl font-bold tracking-tight">Factura</div>
            <div className="text-sm text-neutral-500 capitalize mt-1">{monthLabel}</div>
          </div>
          <div className="text-right text-sm text-neutral-500">Fecha de emisión: {today}</div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <div className="text-[10px] uppercase text-neutral-400 font-medium mb-1">Emite</div>
            <div className="font-medium">{emisor.name}</div>
            {emisor.taxId && <div className="text-neutral-600">NIF: {emisor.taxId}</div>}
            {emisor.address && <div className="text-neutral-600 whitespace-pre-line">{emisor.address}</div>}
            {emisor.iban && <div className="text-neutral-600">IBAN: {emisor.iban}</div>}
            {emisor.email && <div className="text-neutral-500">{emisor.email}</div>}
          </div>
          <div>
            <div className="text-[10px] uppercase text-neutral-400 font-medium mb-1">Para</div>
            <div className="font-medium">{receptor.name}</div>
            {receptor.taxId && <div className="text-neutral-600">NIF: {receptor.taxId}</div>}
            {receptor.address && <div className="text-neutral-600 whitespace-pre-line">{receptor.address}</div>}
          </div>
        </div>

        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b-2 border-neutral-900 text-left">
              <th className="py-2 font-medium">Concepto</th>
              <th className="py-2 font-medium">Detalle</th>
              <th className="py-2 font-medium text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr><td colSpan={3} className="py-4 text-neutral-400 italic">Sin conceptos este mes.</td></tr>
            ) : (
              lines.map((l, i) => (
                <tr key={i} className="border-b border-neutral-100">
                  <td className="py-2.5 font-medium">{l.concept}</td>
                  <td className="py-2.5 text-neutral-500">{l.detail}</td>
                  <td className="py-2.5 text-right tabular-nums">{eur(l.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200">
              <td className="py-2 text-neutral-500" colSpan={2}>Base imponible</td>
              <td className="py-2 text-right tabular-nums">{eur(base)}</td>
            </tr>
            <tr>
              <td className="py-1 text-neutral-500" colSpan={2}>{vatExempt ? "IVA (exento)" : `IVA (${VAT_RATE}%)`}</td>
              <td className="py-1 text-right tabular-nums">{vatExempt ? "—" : eur(ivaAmount)}</td>
            </tr>
            <tr className="border-t-2 border-neutral-900">
              <td className="py-3 font-bold" colSpan={2}>TOTAL</td>
              <td className="py-3 text-right font-bold text-lg tabular-nums">{eur(totalConIva)}</td>
            </tr>
          </tfoot>
        </table>

        {vatExempt && (
          <p className="text-xs text-neutral-600 border border-neutral-200 rounded-lg p-3 bg-neutral-50">
            Factura exenta de IVA por el artículo 20 de la Ley 37/1992.
          </p>
        )}
        {c.notes && <p className="text-xs text-neutral-500 mt-3">{c.notes}</p>}
        <p className="text-[11px] text-neutral-400 mt-6">
          Importe calculado automáticamente según las condiciones laborales registradas. Revisa antes de emitir.
        </p>
      </div>
    </div>
  );
}
