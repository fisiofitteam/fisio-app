"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Pro = { id: string; fullName: string; role: string };

type MinimalLead = {
  id: string;
  fullName: string;
  contactType: string;
  contactValue: string;
  email: string | null;
  phone: string | null;
};

const METHODS = [
  { value: "Transferencia", label: "Transferencia" },
  { value: "Bizum", label: "Bizum" },
  { value: "PayPal", label: "PayPal" },
  { value: "Efectivo", label: "Efectivo" },
  { value: "Otro", label: "Otro" },
];

/**
 * Botón inline "💰 Registrar venta manual" — para leads Vendidos que no
 * completaron el pago por Stripe (transferencia/Bizum/PayPal/etc). Da de alta
 * al paciente y crea el ingreso en Finanzas en una sola operación.
 *
 * Reutiliza el endpoint /api/leads/convert (mismo que la conversión desde el
 * board de leads), extendido con paymentMethod para anotarlo en la descripción
 * de la transacción.
 */
export function ManualSaleButton({
  lead,
  fisios,
}: {
  lead: MinimalLead;
  fisios: Pro[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="text-[11px] text-emerald-700 mt-1 inline-block hover:underline"
        title="Dar de alta al paciente y registrar el ingreso — pago fuera de Stripe"
      >
        💰 Registrar venta manual
      </button>
      {open && (
        <ManualSaleModal lead={lead} fisios={fisios} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ManualSaleModal({
  lead,
  fisios,
  onClose,
}: {
  lead: MinimalLead;
  fisios: Pro[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [assignedProfessionalId, setAssignedProfessionalId] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [subscriptionPeriodMonths, setSubscriptionPeriodMonths] = useState("4");
  const [programType, setProgramType] = useState("RECUPERA");
  const [email, setEmail] = useState(
    lead.email ?? (lead.contactType === "email" ? lead.contactValue : "")
  );
  const [phone, setPhone] = useState(
    lead.phone ?? (lead.contactType === "phone" ? lead.contactValue : "")
  );
  const [paymentMethod, setPaymentMethod] = useState("Transferencia");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (!amountPaid) {
      setError("Falta el importe");
      return;
    }
    if (!email.trim()) {
      setError("El email es obligatorio para que el paciente pueda entrar a la app");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/leads/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        assignedProfessionalId: assignedProfessionalId || null,
        amountPaid,
        subscriptionPeriodMonths,
        programType,
        email: email.trim(),
        phone: phone.trim() || null,
        paymentMethod,
      }),
    });
    if (res.ok) {
      onClose();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo registrar la venta");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-medium">💰 Registrar venta manual</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          {lead.fullName} pagó fuera de Stripe. Se dará de alta como paciente y se
          registrará el ingreso en Finanzas.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Email del paciente *</label>
            <input
              type="email"
              className="input text-sm w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="paciente@ejemplo.com"
            />
            <p className="text-[10px] text-neutral-500 mt-0.5 italic">
              Necesario para que pueda entrar a la app.
            </p>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Teléfono (opcional)</label>
            <input
              type="tel"
              className="input text-sm w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 600000000"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Fisio asignado</label>
            <select
              className="input text-sm w-full"
              value={assignedProfessionalId}
              onChange={(e) => setAssignedProfessionalId(e.target.value)}
            >
              <option value="">— Sin asignar (lo asigna luego un manager) —</option>
              {fisios.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.role === "head_success" ? "⭐ " : "🩺 "}{f.fullName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Programa contratado</label>
            <div className="flex gap-1">
              {["RECUPERA", "CONSOLIDA", "ADVANCE"].map((p) => (
                <button
                  key={p}
                  onClick={() => setProgramType(p)}
                  className={`flex-1 text-xs px-2 py-2 rounded border font-medium ${
                    programType === p
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "bg-white border-neutral-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Duración (meses)</label>
              <select
                className="input text-sm w-full"
                value={subscriptionPeriodMonths}
                onChange={(e) => setSubscriptionPeriodMonths(e.target.value)}
              >
                <option value="1">1 mes</option>
                <option value="2">2 meses</option>
                <option value="3">3 meses</option>
                <option value="4">4 meses</option>
                <option value="6">6 meses</option>
                <option value="12">12 meses</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Importe (€) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input text-sm w-full"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Método de pago</label>
            <select
              className="input text-sm w-full"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <p className="text-[11px] text-neutral-500 italic">
            💡 Se registra como ingreso "Nueva alta" en Finanzas. El método se anota en la descripción.
            Luego podrás enviarle el link de la app desde esta misma tarjeta.
          </p>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={save}
            disabled={!amountPaid || !email.trim() || saving}
            className="btn btn-accent w-full"
          >
            {saving ? "Procesando..." : "Confirmar venta"}
          </button>
        </div>
      </div>
    </div>
  );
}
