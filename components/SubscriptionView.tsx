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

/**
 * Meses "completos" entre dos fechas — cuenta cuántos meses de calendario
 * caben desde start hasta end. Ejemplos:
 *   13-abr → 14-jul (día ≥) = 3 meses
 *   13-abr → 13-jul (día ≥) = 3 meses
 *   13-abr → 12-jul (día <) = 2 meses
 *
 * Se usa en lugar del campo `periodMonths` almacenado porque en pacientes
 * migrados o editados a mano las dos verdades pueden divergir. La UI ha de
 * reflejar la duración REAL según las fechas visibles.
 */
function monthsBetween(startISO: string | null, endISO: string | null): number | null {
  if (!startISO || !endISO) return null;
  const s = new Date(startISO);
  const e = new Date(endISO);
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() < s.getDate()) months -= 1;
  return Math.max(0, months);
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

type Metrics = {
  totalMonths: number;
  lifetimeValue: number;
  renewalsCount: number;
};

export function SubscriptionView({
  patient,
  sale,
  transactions,
  isManager,
  isCeo,
  metrics,
  totalDaysExtended,
  canEditSubscription,
  currentPeriod,
}: {
  patient: Patient;
  sale: Sale | null;
  transactions: Transaction[];
  isManager: boolean;
  isCeo: boolean;
  metrics: Metrics;
  totalDaysExtended: number;
  // True si el usuario actual puede editar/borrar periodos de suscripción.
  // Managers siempre; fisios solo si el paciente no vino por Stripe (alta
  // manual o legacy). Se calcula en el server.
  canEditSubscription: boolean;
  // Renewal vigente (active o más reciente). Fuente de verdad ÚNICA para
  // "Programa actual". Antes mostrábamos duración/inicio/fin del Patient
  // (campos legacy) que podían diverger del renewal — llevaba a que
  // "Duración contratada" y "Meses contratados" contradijeran a los
  // periodos listados abajo.
  currentPeriod: {
    startDate: string;
    endDate: string | null;
    periodMonths: number;
    programType: string;
  } | null;
}) {
  // Datos "Programa actual" con currentPeriod como fuente de verdad.
  const cpStartDate = currentPeriod?.startDate ?? patient.programStartDate ?? patient.subscriptionStartDate;
  const cpEndDate = (() => {
    if (currentPeriod?.endDate) return currentPeriod.endDate;
    // Fallback: patient.programEndDate + días extendidos (pacientes antiguos).
    if (!patient.programEndDate) return null;
    if (!totalDaysExtended) return patient.programEndDate;
    const d = new Date(patient.programEndDate);
    d.setDate(d.getDate() + totalDaysExtended);
    return d.toISOString();
  })();
  // Duración = meses reales entre fechas del renewal vigente. No usamos el
  // campo periodMonths guardado porque en pacientes migrados suele estar
  // desalineado con las fechas (el fisio veía "4 meses" en un rango de 3).
  const cpDurationMonths =
    monthsBetween(cpStartDate, cpEndDate) ??
    currentPeriod?.periodMonths ??
    patient.programDurationMonths ??
    null;
  const cpProgramType = currentPeriod?.programType ?? patient.programType ?? "—";
  return (
    <div className="space-y-4">
      {/* Cuadro de KPIs (solo CEO) */}
      {isCeo && (
        <section className="card">
          <h2 className="font-medium mb-3">📊 KPIs del paciente</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KpiTile label="Meses contratados" value={`${metrics.totalMonths} ${metrics.totalMonths === 1 ? "mes" : "meses"}`} />
            <KpiTile label="Life Time Value" value={formatAmount(metrics.lifetimeValue)} />
            <KpiTile label="Nº de renovaciones" value={String(metrics.renewalsCount)} />
          </div>
        </section>
      )}

      {/* Bloque 2: Programa actual (resumen del periodo vigente) */}
      <section className="card space-y-3">
        <div>
          <h2 className="font-medium">📅 Programa actual</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Resumen del periodo vigente. Para histórico completo, ver "Periodos de suscripción" abajo.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <Field label="Programa" value={cpProgramType} />
          <Field label="Duración contratada" value={cpDurationMonths ? `${cpDurationMonths} ${cpDurationMonths === 1 ? "mes" : "meses"}` : "—"} />
          <Field label="Inicio del programa" value={formatDate(cpStartDate)} />
          <Field label="Fin previsto" value={
            <span>
              {formatDate(cpEndDate)}
              {totalDaysExtended > 0 && (
                <span className="text-[11px] text-neutral-500 ml-1">(+{totalDaysExtended}d por pausas)</span>
              )}
            </span>
          } />
        </div>
        <p className="text-[11px] text-neutral-500 italic">
          La fecha de fin se actualiza automáticamente si añades pausas que extiendan el programa.
        </p>
      </section>

      {/* Bloque 3: Periodos de suscripción (renovaciones, etc) */}
      <section className="card space-y-3">
        <h2 className="font-medium">🔁 Periodos de suscripción</h2>
        <SubscriptionPeriodsBlock
          patientId={patient.id}
          isManager={isManager}
          isCeo={isCeo}
          canEdit={canEditSubscription}
        />
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

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-50 rounded-lg p-3">
      <div className="text-[11px] text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold text-neutral-900 mt-1">{value}</div>
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
