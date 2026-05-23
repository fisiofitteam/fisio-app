"use client";

import { SubscriptionPeriodsBlock } from "./SubscriptionPeriodsBlock";
import { ProgramPausesBlock } from "./ProgramPausesBlock";

type Patient = {
  id: string;
  fullName: string;
  programType: string | null;
  programMode: string;
  subscriptionStartDate: string | null;
  subscriptionPeriodMonths: number;
  subscriptionTotalMonths: number;
  programDurationMonths: number | null;
  programStartDate: string | null;
  programEndDate: string | null;
};

type Sale = {
  id: string;
  productCode: string;
  programType: string;
  durationMonths: number;
  amountCents: number;
  currency: string;
  paymentMethod: string | null;
  status: string;
  paidAt: string | null;
  stripePaymentIntentId: string | null;
  closer: { id: string; fullName: string; role: string } | null;
};

type Transaction = {
  id: string;
  type: string;
  category: string | null;
  amount: number;
  description: string | null;
  occurredAt: string;
  professional: { id: string; fullName: string } | null;
};

function formatEuros(cents: number, currency: string): string {
  const value = cents / 100;
  const sym = currency.toUpperCase() === "EUR" ? "€" : currency.toUpperCase();
  return `${value.toFixed(2).replace(".", ",")} ${sym}`;
}

function formatAmount(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })} · ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: "💳 Tarjeta",
  klarna: "🟣 Klarna",
};

const TX_TYPE_LABEL: Record<string, string> = {
  income_new: "Nueva alta",
  income_renewal: "Renovación",
  income_other: "Otros ingresos",
  expense: "Gasto",
};

export function SubscriptionView({
  patient,
  sale,
  transactions,
  isManager,
}: {
  patient: Patient;
  sale: Sale | null;
  transactions: Transaction[];
  isManager: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Bloque 1: Datos del pago (Sale Stripe) */}
      <section className="card space-y-3">
        <h2 className="font-medium">💳 Datos del pago</h2>

        {!sale ? (
          <p className="text-sm text-neutral-500 italic">
            Este paciente no tiene un pago vinculado a Stripe. Probablemente fue dado de alta manualmente antes del sistema de pagos online.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <Field label="Programa contratado" value={`${sale.programType} · ${sale.durationMonths} meses`} />
            <Field label="Importe pagado" value={formatEuros(sale.amountCents, sale.currency)} strong />
            <Field label="Método de pago" value={PAYMENT_METHOD_LABEL[sale.paymentMethod || ""] || sale.paymentMethod || "—"} />
            <Field label="Fecha del pago" value={formatDateTime(sale.paidAt)} />
            <Field label="Estado" value={
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                sale.status === "paid" ? "bg-emerald-100 text-emerald-800" :
                sale.status === "refunded" ? "bg-red-100 text-red-800" :
                sale.status === "failed" ? "bg-red-100 text-red-800" :
                "bg-neutral-100 text-neutral-700"
              }`}>{sale.status}</span>
            } />
            <Field label="Closer" value={sale.closer ? `${sale.closer.fullName}${sale.closer.role === "ceo" ? " (CEO)" : ""}` : "—"} />
            {isManager && sale.stripePaymentIntentId && (
              <div className="md:col-span-2">
                <Field label="ID Stripe" value={
                  <span className="font-mono text-xs text-neutral-600 break-all">{sale.stripePaymentIntentId}</span>
                } />
              </div>
            )}
          </div>
        )}
      </section>

      {/* Bloque 2: Programa actual (resumen del periodo vigente) */}
      <section className="card space-y-3">
        <div>
          <h2 className="font-medium">📅 Programa actual</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Resumen del periodo vigente. Para histórico completo, ver "Periodos de suscripción" abajo.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <Field label="Programa" value={patient.programType || "—"} />
          <Field label="Duración contratada" value={patient.programDurationMonths ? `${patient.programDurationMonths} meses` : "—"} />
          <Field label="Inicio del programa" value={formatDate(patient.programStartDate)} />
          <Field label="Fin previsto" value={formatDate(patient.programEndDate)} />
        </div>
        <p className="text-[11px] text-neutral-500 italic">
          La fecha de fin se actualiza automáticamente si añades pausas que extiendan el programa.
        </p>
      </section>

      {/* Bloque 3: Periodos de suscripción (renovaciones, etc) */}
      <section className="card space-y-3">
        <h2 className="font-medium">🔁 Periodos de suscripción</h2>
        <SubscriptionPeriodsBlock patientId={patient.id} isManager={isManager} />
      </section>

      {/* Bloque 4: Pausas y vacaciones */}
      <section className="card space-y-3">
        <h2 className="font-medium">⏸ Pausas y vacaciones</h2>
        <ProgramPausesBlock patientId={patient.id} programMode={patient.programMode} />
      </section>

      {/* Bloque 5: Histórico de transacciones */}
      <section className="card space-y-3">
        <h2 className="font-medium">💰 Histórico de transacciones</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-neutral-500 italic">No hay transacciones registradas para este paciente.</p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {transactions.map((t) => (
              <div key={t.id} className="py-2 flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-medium text-sm">{TX_TYPE_LABEL[t.type] || t.type}</span>
                    {t.category && (
                      <span className="text-xs text-neutral-500">· {t.category}</span>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-xs text-neutral-600 mt-0.5">{t.description}</p>
                  )}
                  <div className="text-[11px] text-neutral-500 mt-0.5">
                    {formatDateTime(t.occurredAt)}
                    {t.professional && <> · {t.professional.fullName}</>}
                  </div>
                </div>
                <div className={`text-sm font-medium whitespace-nowrap ${t.type === "expense" ? "text-red-600" : "text-emerald-700"}`}>
                  {t.type === "expense" ? "-" : "+"}{formatAmount(t.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs text-neutral-500 mb-0.5">{label}</div>
      <div className={`${strong ? "font-semibold text-base" : "text-sm"} text-neutral-900`}>{value}</div>
    </div>
  );
}
