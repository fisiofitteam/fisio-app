"use client";

/**
 * Renderiza una factura emitida a paciente, lista para imprimir / guardar
 * como PDF. Similar al InvoiceClient del fisio pero con cliente = Patient.
 *
 * Las facturas son inmutables: no hay edición. Solo se pueden anular desde
 * el listado (eso se hace en otro lado).
 */

type Invoice = {
  id: string;
  number: string;
  issueDate: string;
  clientName: string;
  clientTaxId: string | null;
  clientAddress: string | null;
  clientEmail: string | null;
  issuerName: string;
  issuerTaxId: string | null;
  issuerAddress: string | null;
  issuerIban: string | null;
  concept: string;
  baseAmount: number;
  vatExempt: boolean;
  vatRate: number;
  vatAmount: number;
  irpfRate: number;
  irpfAmount: number;
  totalAmount: number;
  cancelledAt: string | null;
  cancellationReason: string | null;
};

function eur(n: number): string {
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
}

export function PatientInvoiceClient({ invoice }: { invoice: Invoice }) {
  const issueDate = new Date(invoice.issueDate).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-white text-neutral-900 min-h-screen">
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>

      <div className="no-print sticky top-0 bg-neutral-50 border-b border-neutral-200 px-4 py-3 flex justify-between items-center gap-3 flex-wrap">
        <a href="/fisio/finanzas/facturas-pacientes" className="text-sm text-neutral-500 hover:underline">
          ← Volver al listado
        </a>
        <button onClick={() => window.print()} className="btn btn-primary text-sm">
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-8 py-10">
        {invoice.cancelledAt && (
          <div
            className="no-print mb-4 rounded-lg px-3 py-2 text-sm"
            style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", color: "#7F1D1D" }}
          >
            <strong>⚠ ANULADA</strong> el{" "}
            {new Date(invoice.cancelledAt).toLocaleDateString("es-ES")}.
            {invoice.cancellationReason && ` Motivo: ${invoice.cancellationReason}`}
          </div>
        )}

        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="text-2xl font-bold tracking-tight">Factura</div>
            <div className="text-sm text-neutral-500 mt-1">{invoice.number}</div>
          </div>
          <div className="text-right text-sm text-neutral-500">Fecha de emisión: {issueDate}</div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <div className="text-[10px] uppercase text-neutral-400 font-medium mb-1">Emite</div>
            <div className="font-medium">{invoice.issuerName}</div>
            {invoice.issuerTaxId && <div className="text-neutral-600">NIF: {invoice.issuerTaxId}</div>}
            {invoice.issuerAddress && (
              <div className="text-neutral-600 whitespace-pre-line">{invoice.issuerAddress}</div>
            )}
            {invoice.issuerIban && <div className="text-neutral-600">IBAN: {invoice.issuerIban}</div>}
          </div>
          <div>
            <div className="text-[10px] uppercase text-neutral-400 font-medium mb-1">Para</div>
            <div className="font-medium">{invoice.clientName}</div>
            {invoice.clientTaxId && (
              <div className="text-neutral-600">NIF: {invoice.clientTaxId}</div>
            )}
            {invoice.clientAddress && (
              <div className="text-neutral-600 whitespace-pre-line">{invoice.clientAddress}</div>
            )}
            {invoice.clientEmail && (
              <div className="text-neutral-500">{invoice.clientEmail}</div>
            )}
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
              <td className="py-2.5 font-medium" colSpan={2}>{invoice.concept}</td>
              <td className="py-2.5 text-right tabular-nums">{eur(invoice.baseAmount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200">
              <td className="py-2 text-neutral-500" colSpan={2}>Base imponible</td>
              <td className="py-2 text-right tabular-nums">{eur(invoice.baseAmount)}</td>
            </tr>
            <tr>
              <td className="py-1 text-neutral-500" colSpan={2}>
                {invoice.vatExempt
                  ? "IVA (exento)"
                  : `IVA (${invoice.vatRate}%)`}
              </td>
              <td className="py-1 text-right tabular-nums">
                {invoice.vatExempt ? "—" : eur(invoice.vatAmount)}
              </td>
            </tr>
            {invoice.irpfRate > 0 && (
              <tr>
                <td className="py-1 text-neutral-500" colSpan={2}>
                  Retención IRPF (-{invoice.irpfRate}%)
                </td>
                <td className="py-1 text-right tabular-nums text-red-700">
                  -{eur(invoice.irpfAmount)}
                </td>
              </tr>
            )}
            <tr className="border-t-2 border-neutral-900">
              <td className="py-3 font-bold" colSpan={2}>TOTAL</td>
              <td className="py-3 text-right font-bold text-lg tabular-nums">
                {eur(invoice.totalAmount)}
              </td>
            </tr>
          </tfoot>
        </table>

        {invoice.vatExempt && (
          <p className="text-xs text-neutral-600 border border-neutral-200 rounded-lg p-3 bg-neutral-50">
            Factura exenta de IVA por el artículo 20 de la Ley 37/1992.
          </p>
        )}
      </div>
    </div>
  );
}
