"use client";

import { useState } from "react";
import type { SalaryResult } from "@/lib/compensation";

function eur(n: number): string {
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
}

type Emisor = { name: string; taxId: string | null; address: string | null; iban: string | null; email: string | null };
type Receptor = { name: string; taxId: string | null; address: string | null };

// Retención IRPF fija y obligatoria del 15% para todas las facturas del
// equipo. Antes era editable (0-15% con default 7%) y el CEO reporta que
// no cumplía con la obligación fiscal — ahora no se puede modificar
// desde el UI; si en el futuro hay que cambiarla (p. ej. 7% primer año
// autónomo), se toca aquí.
const IRPF_RATE = 15;

export function InvoiceClient({
  emisor,
  receptor,
  vatExempt,
  year,
  month,
  invoiceNumber,
  autoInvoiceNumber,
  professionalId,
  salary,
}: {
  emisor: Emisor;
  receptor: Receptor;
  vatExempt: boolean;
  year: number;
  month: number;
  /** Número actual que se pinta (override manual si existe, si no el auto). */
  invoiceNumber: string;
  /** Número correlativo que se calcula automáticamente — por si el user
   *  quiere resetear al default escribiendo este valor. */
  autoInvoiceNumber: string;
  professionalId: string;
  salary: SalaryResult;
}) {
  const [number, setNumber] = useState(invoiceNumber);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  async function saveNumber(next: string) {
    setSaveState("saving");
    setSaveError(null);
    try {
      // Si el user deja el input igual al automático, mandamos vacío
      // para borrar el override y seguir con el calculado por defecto.
      const value = next.trim() === autoInvoiceNumber ? "" : next.trim();
      const res = await fetch("/api/team-invoice-meta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalId, year, month, invoiceNumber: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setSaveState("error");
        setSaveError(data?.hint || data?.error || "No se pudo guardar");
        return;
      }
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1200);
    } catch (e: any) {
      setSaveState("error");
      setSaveError(e?.message || "Error de red");
    }
  }
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  const today = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  // Concepto único y genérico en TODAS las facturas (no se desglosa la compensación
  // real, para no comprometer la naturaleza del servicio ni la exención).
  const conceptText = `Servicios de fisioterapia y rehabilitación prestados en ${monthLabel}`;

  const base = salary.total;
  const VAT_RATE = 21;
  const ivaAmount = vatExempt ? 0 : base * (VAT_RATE / 100);
  const irpfAmount = base * (IRPF_RATE / 100);
  const totalFactura = base + ivaAmount - irpfAmount;

  return (
    <div className="bg-white text-neutral-900 min-h-screen">
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>

      <div className="no-print sticky top-0 bg-neutral-50 border-b border-neutral-200 px-4 py-3 flex justify-between items-center gap-3 flex-wrap">
        <a href="/fisio" className="text-sm text-neutral-500 hover:underline">← Volver</a>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-600">
            Retención IRPF: <strong className="text-neutral-900">{IRPF_RATE}%</strong> <span className="text-neutral-400">(obligatoria)</span>
          </span>
          <button onClick={() => window.print()} className="btn btn-primary text-sm">🖨️ Imprimir / Guardar PDF</button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-8 py-10">
        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="text-2xl font-bold tracking-tight flex items-baseline gap-1">
              <span>Factura Nº</span>
              <input
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                onBlur={() => {
                  if (number !== invoiceNumber) saveNumber(number);
                }}
                maxLength={50}
                className="no-print bg-amber-50 border-b border-dashed border-amber-400 px-1 rounded-sm focus:outline-none focus:border-amber-600 min-w-[7ch] max-w-[16ch] font-bold tracking-tight"
                style={{ width: `${Math.max(number.length + 1, 7)}ch` }}
                title="Edita el número; se guarda al salir del campo"
              />
              <span className="hidden print:inline">{number}</span>
            </div>
            <div className="text-sm text-neutral-500 capitalize mt-1 flex items-center gap-2">
              <span>{monthLabel}</span>
              <span className="no-print text-[10px] text-neutral-400">
                {saveState === "saving" && "guardando…"}
                {saveState === "saved" && <span className="text-emerald-600">✓ guardado</span>}
                {saveState === "error" && <span className="text-red-600" title={saveError ?? undefined}>✕ error</span>}
              </span>
            </div>
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
            <tr>
              <td className="py-1 text-neutral-500" colSpan={2}>Retención IRPF (-{IRPF_RATE}%)</td>
              <td className="py-1 text-right tabular-nums text-red-700">-{eur(irpfAmount)}</td>
            </tr>
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
