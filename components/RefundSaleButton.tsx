"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Botón + modal de "Devolver pago" en la ficha del paciente (solo CEO).
 * Ejecuta POST /api/admin/sales/[id]/refund que:
 *  - Refund del capture PayPal + cancel de la suscripción (opcional)
 *  - Marca Sale como refunded
 *  - Marca al Patient como isTest → sale de todas las métricas y comisiones
 *  - Borra las Transactions income_new del paciente
 */
export function RefundSaleButton({
  saleId,
  amount,
  paidAt,
  paymentMethod,
  hasPayPalCapture,
  hasPayPalSubscription,
}: {
  saleId: string;
  amount: number; // en €
  paidAt: string | null;
  paymentMethod: string | null;
  hasPayPalCapture: boolean;
  hasPayPalSubscription: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [markOnly, setMarkOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPayPal = hasPayPalCapture || hasPayPalSubscription;

  async function submit() {
    setError(null);
    if (!reason.trim()) {
      setError("El motivo es obligatorio.");
      return;
    }
    if (!confirm(`¿Confirmar devolución de ${amount.toFixed(2)}€? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/sales/${saleId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), mode: markOnly ? "mark_only" : "paypal_and_mark" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Error al procesar la devolución.");
        setSaving(false);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Error de red.");
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium px-3 py-1.5 rounded-lg"
        style={{ background: "#FEE2E2", color: "#7F1D1D", border: "1px solid #FCA5A5" }}
      >
        ↩ Devolver pago
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Devolver pago</h3>
              <button onClick={() => setOpen(false)} className="text-neutral-400 text-xl">✕</button>
            </div>

            <div className="text-xs text-neutral-600 mb-3 space-y-0.5">
              <div><strong>Importe:</strong> {amount.toFixed(2)} €</div>
              {paidAt && <div><strong>Pagado el:</strong> {new Date(paidAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</div>}
              <div><strong>Método:</strong> {paymentMethod ?? "—"}</div>
            </div>

            <div className="mb-3">
              <label className="text-xs text-neutral-700 block mb-1 font-medium">Motivo <span className="text-red-600">*</span></label>
              <textarea
                className="input text-sm w-full"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: El cliente pidió devolución por no encajar el programa"
              />
            </div>

            {isPayPal && (
              <label className="flex items-start gap-2 mb-3 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={markOnly}
                  onChange={(e) => setMarkOnly(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <strong>Solo marcar en la BD</strong> — ya devolví el pago manualmente en el dashboard de PayPal. No llamar a la API de PayPal.
                </span>
              </label>
            )}

            <div className="rounded-lg p-2.5 mb-3 text-[11px]" style={{ background: "#FEF3C7", border: "1px solid #F59E0B", color: "#78350F" }}>
              Al confirmar:
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                {!markOnly && isPayPal && <li>Se ejecutará el refund en PayPal {hasPayPalSubscription && "y se cancelará la suscripción"}</li>}
                <li>El paciente pasará a modo TEST (fuera de métricas)</li>
                <li>Se quitará esta venta de la comisión del closer</li>
                <li>Se borrarán las transacciones de ingreso del paciente</li>
                <li>Se terminarán sus renovaciones activas → el paciente sale del panel del fisio</li>
              </ul>
            </div>

            {error && (
              <div className="rounded-lg p-2 mb-3 text-xs" style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", color: "#7F1D1D" }}>
                ⚠ {error}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setOpen(false)} className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200">
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={saving || !reason.trim()}
                className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ background: "#7F1D1D", color: "#FAFAFA" }}
              >
                {saving ? "Procesando…" : "Confirmar devolución"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
