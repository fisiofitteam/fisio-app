"use client";

import type { SalaryResult } from "@/lib/compensation";

function eur(n: number): string {
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
}

export function InvoiceClient({
  pro,
  year,
  month,
  salary,
}: {
  pro: { fullName: string; email: string | null };
  year: number;
  month: number;
  salary: SalaryResult;
}) {
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  const today = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  const c = salary.config;
  const b = salary.breakdown;

  // Líneas de concepto (solo las que aportan)
  const lines: { concept: string; detail: string; amount: number }[] = [];
  if (c.baseSalary > 0) lines.push({ concept: "Sueldo fijo", detail: "Mensual", amount: b.fixed });
  if (c.perActivePatient > 0) lines.push({ concept: "Pacientes activos", detail: `${salary.activePatients} × ${eur(c.perActivePatient)}`, amount: b.patients });
  if (c.renewalOwnPct > 0 || c.renewalOthersPct > 0) {
    const parts: string[] = [];
    if (c.renewalOwnPct > 0) parts.push(`${c.renewalOwnPct}% de ${eur(salary.renewalOwnRevenue)} (propias)`);
    if (c.renewalOthersPct > 0) parts.push(`${c.renewalOthersPct}% de ${eur(salary.renewalOthersRevenue)} (equipo)`);
    lines.push({ concept: "Comisión por renovaciones", detail: parts.join(" + "), amount: b.renewals });
  }
  if (c.newSaleCommissionPct > 0) lines.push({ concept: "Comisión por ventas nuevas", detail: `${c.newSaleCommissionPct}% de ${eur(salary.newSaleRevenue)} (${salary.newSaleCount} venta${salary.newSaleCount === 1 ? "" : "s"})`, amount: b.newSales });

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
          <div className="text-right text-sm">
            <div className="font-semibold">FisioFit Team</div>
            <div className="text-neutral-500">Fecha: {today}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <div className="text-[10px] uppercase text-neutral-400 font-medium mb-1">Emite</div>
            <div className="font-medium">{pro.fullName}</div>
            {pro.email && <div className="text-neutral-500">{pro.email}</div>}
          </div>
          <div>
            <div className="text-[10px] uppercase text-neutral-400 font-medium mb-1">Para</div>
            <div className="font-medium">FisioFit Team</div>
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
            <tr className="border-t-2 border-neutral-900">
              <td className="py-3 font-bold" colSpan={2}>TOTAL</td>
              <td className="py-3 text-right font-bold text-lg tabular-nums">{eur(salary.total)}</td>
            </tr>
          </tfoot>
        </table>

        {c.notes && <p className="text-xs text-neutral-500 border-t border-neutral-100 pt-3">{c.notes}</p>}
        <p className="text-[11px] text-neutral-400 mt-6">
          Importe calculado automáticamente según las condiciones laborales registradas. Revisa antes de emitir.
        </p>
      </div>
    </div>
  );
}
