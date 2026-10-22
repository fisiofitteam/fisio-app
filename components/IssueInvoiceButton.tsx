"use client";

import { InvoiceDetails } from "@/lib/invoice-details";
import { useState } from "react";

type Patient = {
  id: string;
  fullName: string;
  hasFiscalAddress: boolean;
  hasTaxId: boolean;
};

/**
 * Botón "🧾 Emitir factura" + modal de generación. Solo se renderiza para CEO.
 *
 * Flujo:
 *  1. Click → modal abre con campos prefijados (concepto sugerido, importe en
 *     blanco para que el CEO lo introduzca).
 *  2. Si al paciente le faltan datos fiscales (DNI o dirección), muestra
 *     un aviso ámbar antes del form.
 *  3. Generar → POST /api/patients/[id]/invoices → redirige a la nueva
 *     factura imprimible.
 */
export function IssueInvoiceButton({
  patient,
  suggestedConcept,
  suggestedAmount,
}: {
  patient: Patient;
  suggestedConcept?: string;
  suggestedAmount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [concept, setConcept] = useState(
    suggestedConcept || "Servicios de fisioterapia y rehabilitación"
  );
  const [amount, setAmount] = useState(
    suggestedAmount ? suggestedAmount.toFixed(2) : ""
  );
  const [vatExempt, setVatExempt] = useState(true);
  const [vatRate, setVatRate] = useState("0");
  const [irpfRate, setIrpfRate] = useState("0");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [details, setDetails] = useState<InvoiceDetails | null>(null);
  const [loading, setLoading] = useState(false);
  async function loadDetails() {
    setOpen(true);
    setLoading(true);
    setDetails(null);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patient.id}/invoices?defaults=1`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar los datos");
      setDetails(data.details);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los datos");
    } finally { setLoading(false); }
  }
  async function emit() {
    if (!details) return;
    if (!details.clientName.trim() || !details.issuerName.trim()) {
      setError("Completa el nombre del cliente y del emisor");
      return;
    }
    setError(null);
    const baseAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      setError("Introduce un importe válido");
      return;
    }
    if (!concept.trim()) {
      setError("Introduce el concepto");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/patients/${patient.id}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          details,
          concept: concept.trim(),
          baseAmount,
          vatExempt,
          vatRate: vatExempt ? 0 : Number(vatRate),
          irpfRate: Number(irpfRate),
          issueDate: new Date(issueDate).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.invoice) {
        throw new Error(data?.error || "No se pudo emitir la factura");
      }
      // Redirigir a la factura emitida (lista para imprimir)
      window.location.href = `/fisio/factura-paciente/${data.invoice.id}`;
    } catch (e: any) {
      setError(e?.message || "Error al emitir");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={loadDetails}
        className="text-xs font-medium px-3 py-1.5 rounded-lg"
        style={{ background: "#0A0A0A", color: "#FAFAFA" }}
      >
        🧾 Emitir factura
      </button>
    );
  }

  const missingFiscalData = details && (!details.clientTaxId.trim() || !details.clientAddress.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10, 10, 10, 0.55)" }}
      onClick={() => !busy && setOpen(false)}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl p-5 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">🧾 Emitir factura</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-neutral-400 text-xl leading-none px-2"
            disabled={busy}
          >
            ×
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Revisa y modifica los datos antes de emitir. Los cambios de este formulario se aplican solo a esta factura.
          La numeración se asigna automáticamente.
        </p>

        {loading && <p className="text-sm mb-3">Cargando datos fiscales…</p>}
        {!loading && !details && <button type="button" className="btn mb-3" onClick={loadDetails}>Reintentar carga</button>}
        {missingFiscalData && <p className="rounded-lg bg-amber-50 text-amber-900 text-xs p-3 mb-3">Falta el DNI / NIF o la dirección del cliente. Puedes completarlos aquí antes de emitir.</p>}
        {details && (
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            {([
              ["Datos del cliente", [["clientName", "Nombre / razón social"], ["clientTaxId", "DNI / NIE / NIF"], ["clientAddress", "Dirección fiscal"], ["clientEmail", "Email"]]],
              ["Datos del emisor", [["issuerName", "Nombre / razón social"], ["issuerTaxId", "NIF"], ["issuerAddress", "Dirección fiscal"], ["issuerIban", "IBAN"]]],
            ] as const).map(([title, fields]) => (
              <fieldset key={title} disabled={busy} className="space-y-2 rounded-lg border border-neutral-200 p-3">
                <legend className="text-sm font-semibold px-1">{title}</legend>
                {fields.map(([key, label]) => (
                  <div key={key}>
                    <label htmlFor={`invoice-${key}`} className="text-xs text-neutral-600 block mb-1">{label}</label>
                    {key.endsWith("Address") ? (
                      <textarea id={`invoice-${key}`} maxLength={2000} rows={3} value={details[key]} onChange={e => setDetails({ ...details, [key]: e.target.value })} className="input text-sm w-full" />
                    ) : (
                      <input id={`invoice-${key}`} maxLength={2000} value={details[key]} onChange={e => setDetails({ ...details, [key]: e.target.value })} className="input text-sm w-full" />
                    )}
                  </div>
                ))}
              </fieldset>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-600 block mb-1">Concepto</label>
            <input
              type="text"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              className="input text-sm w-full"
              placeholder="Ej. Programa RECUPERA · 4 meses"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-600 block mb-1">Importe (€)</label>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input text-sm w-full tabular-nums"
                placeholder="299.00"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-600 block mb-1">Fecha emisión</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="input text-sm w-full"
              />
            </div>
          </div>

          <div className="rounded-lg p-3" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
            <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={vatExempt}
                onChange={(e) => setVatExempt(e.target.checked)}
              />
              <span>Factura exenta de IVA (Art. 20 Ley 37/1992 — fisioterapia)</span>
            </label>
            <p className="text-[11px] text-neutral-500 mb-2">
              Recomendado para servicios de fisioterapia. Desmarca solo si tu caso requiere IVA.
            </p>

            {!vatExempt && (
              <div className="mt-2">
                <label className="text-xs text-neutral-600 block mb-1">% IVA</label>
                <input type="number" min="0" max="100" step="0.01" value={vatRate} onChange={e => setVatRate(e.target.value)} className="input text-sm w-full" />
              </div>
            )}

            <div className="mt-2">
              <label className="text-xs text-neutral-600 block mb-1">% Retención IRPF</label>
              <input type="number" min="0" max="100" step="0.01" value={irpfRate} onChange={e => setIrpfRate(e.target.value)} className="input text-sm w-full" />
            </div>
          </div>

          {error && (
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", color: "#7F1D1D" }}
            >
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-neutral-500 px-3 py-2"
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={emit}
              disabled={busy || loading || !details}
              className="text-sm font-semibold disabled:opacity-50 px-4 py-2 rounded-lg"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              {busy ? "Emitiendo…" : "🧾 Emitir y abrir factura"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
