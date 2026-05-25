"use client";

import { useState } from "react";
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
  const [irpf, setIrpf] = useState(7); // % retención IRPF, editable al generar la factura

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  const today = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  // Concepto único y genérico en TODAS las facturas (no se desglosa la compensación
  // real, para no comprometer la naturaleza del servicio ni la exención).
  const conceptText = `Servicios de fisioterapia y rehabilitación prestados en ${monthLabel}`;

  const base = salary.total;
  const VAT_RATE = 21;
  const ivaAmount = vatExempt ? 0 : base * (VAT_RATE / 100);
  const irpfAmount = base * (irpf / 100);
  const totalFactura = base + ivaAmount - irpfAmount;

  return (
    <div className="bg-white text-neutral-900 min-h-screen">
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>

      <div className="no-print sticky top-0 bg-neutral-50 border-b border-neutral-200 px-4 py-3 flex justify-between items-center gap-3 flex-wrap">
        <a href="/fisio" className="text-sm text-neutral-500 hover:underline">← Volver</a>
        <div className="flex items-center gap-3">
          <label className="text-sm text-neutral-600 flex items-center gap-1.5">
            Retención IRPF:
            <select className="input text-sm py-1 w-auto" value={irpf} onChange={(e) => setIrpf(Number(e.target.value))}>
              {Array.from({ length: 16 }, (_, n) => (
                <option key={n} value={n}>{n}%</option>
              ))}
            </select>
          </label>
          <button onClick={() => window.print()} className="btn btn-primary text-sm">🖨️ Imprimir / Guardar PDF</button>
        </div>
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
              <th className="py-2 font-medium" colSpan={2}>Concepto</th>
              <th className="py-2 font-medium text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-100">
              <td className="py-2.5 font-medium" colSpan={2}>{conceptText}</td>
              <td className="py-2.5 text-right tabular-nums">{eur(base)}</td>
            </tr>
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
            {irpf > 0 && (
              <tr>
                <td className="py-1 text-neutral-500" colSpan={2}>Retención IRPF (-{irpf}%)</td>
                <td className="py-1 text-right tabular-nums text-red-700">-{eur(irpfAmount)}</td>
              </tr>
            )}
            <tr className="border-t-2 border-neutral-900">
              <td className="py-3 font-bold" colSpan={2}>TOTAL</td>
              <td className="py-3 text-right font-bold text-lg tabular-nums">{eur(totalFactura)}</td>
            </tr>
          </tfoot>
        </table>

        {vatExempt && (
          <p className="text-xs text-neutral-600 border border-neutral-200 rounded-lg p-3 bg-neutral-50">
            Factura exenta de IVA por el artículo 20 de la Ley 37/1992.
          </p>
        )}
        <p className="text-[11px] text-neutral-400 mt-6">
          Importe calculado automáticamente según las condiciones laborales registradas. Revisa antes de emitir.
        </p>
      </div>
    </div>
  );
}
