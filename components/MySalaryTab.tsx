"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Salary = {
  config: { baseSalary: number; perActivePatient: number; renewalOwnPct: number; renewalOthersPct: number; newSaleCommissionPct: number };
  breakdown: { fixed: number; patients: number; renewals: number; newSales: number; vacation: number };
  activePatients: number;
  renewalOwnCount: number;
  renewalOwnRevenue: number;
  newSaleCount: number;
  newSaleRevenue: number;
  daysInMonth: number;
  vacationDaysInMonth: number;
  grossTotal: number;
  total: number;
};

const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0 });

// Lista de los últimos 12 meses (incluido el actual) como opciones.
function lastMonths(count = 12): { year: number; month: number; label: string }[] {
  const out: { year: number; month: number; label: string }[] = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = 0; i < count; i++) {
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
    out.push({ year, month, label });
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

type RenewalDetail = {
  patientId: string;
  patientName: string;
  programType: string | null;
  periodMonths: number;
  amountPaid: number | null;
  attributionDate: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
};

export function MySalaryTab({ professionalId }: { professionalId: string }) {
  const months = lastMonths(12);
  const [sel, setSel] = useState(0); // índice en months (0 = mes actual)
  const [salary, setSalary] = useState<Salary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRenewals, setShowRenewals] = useState(false);
  const [renewals, setRenewals] = useState<RenewalDetail[] | null>(null);
  const [loadingRenewals, setLoadingRenewals] = useState(false);

  const { year, month, label } = months[sel];
  const isCurrent = sel === 0;

  function openRenewals() {
    setShowRenewals(true);
    if (renewals !== null) return;
    setLoadingRenewals(true);
    fetch(`/api/my-salary/renewals?year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : { renewals: [] }))
      .then((d) => setRenewals(d.renewals ?? []))
      .finally(() => setLoadingRenewals(false));
  }

  useEffect(() => {
    setLoading(true);
    fetch(`/api/my-salary?year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setSalary(s))
      .finally(() => setLoading(false));
    // Al cambiar de mes invalidamos la lista cacheada.
    setRenewals(null);
    setShowRenewals(false);
  }, [year, month]);

  const hasComp = salary
    ? salary.config.baseSalary > 0 || salary.config.perActivePatient > 0 || salary.config.renewalOwnPct > 0 || salary.config.renewalOthersPct > 0 || salary.config.newSaleCommissionPct > 0
    : false;

  return (
    <section className="card relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: "linear-gradient(180deg, #FCD34D 0%, #F59E0B 100%)" }} />
      <div className="flex justify-between items-center mb-4 pl-2 flex-wrap gap-2">
        <div>
          <h2 className="font-medium text-sm">Mis métricas y salario</h2>
          <p className="text-xs text-neutral-500 capitalize">{label}{isCurrent ? " · mes en curso" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input text-xs w-auto"
            value={sel}
            onChange={(e) => setSel(Number(e.target.value))}
          >
            {months.map((m, i) => (
              <option key={`${m.year}-${m.month}`} value={i} className="capitalize">
                {i === 0 ? `${m.label} (actual)` : m.label}
              </option>
            ))}
          </select>
          <Link href={`/fisio/factura/${professionalId}?year=${year}&month=${month}`} className="btn text-xs whitespace-nowrap">
            🧾 Factura
          </Link>
        </div>
      </div>

      {loading || !salary ? (
        <p className="pl-2 text-sm text-neutral-400 italic py-6">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pl-2">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Pacientes activos</div>
              <div className="text-2xl font-semibold">{salary.activePatients}</div>
              {!isCurrent && <div className="text-[11px] text-neutral-400 mt-0.5">actual</div>}
            </div>
            <button
              type="button"
              onClick={openRenewals}
              disabled={salary.renewalOwnCount === 0}
              className="text-left cursor-pointer disabled:cursor-default group"
              title={salary.renewalOwnCount > 0 ? "Ver detalle de renovaciones" : ""}
            >
              <div className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
                Renovaciones (mes)
                {salary.renewalOwnCount > 0 && (
                  <span className="text-emerald-600 text-[10px] group-hover:underline">🔍 detalle</span>
                )}
              </div>
              <div className={`text-2xl font-semibold text-emerald-700 ${salary.renewalOwnCount > 0 ? "group-hover:underline" : ""}`}>
                {salary.renewalOwnCount}
              </div>
              <div className="text-xs text-neutral-400 mt-0.5">{eur(salary.renewalOwnRevenue)}</div>
            </button>
            {salary.config.newSaleCommissionPct > 0 ? (
              <div>
                <div className="text-xs text-neutral-500 mb-1">Ventas nuevas (mes)</div>
                <div className="text-2xl font-semibold">{salary.newSaleCount}</div>
                <div className="text-xs text-neutral-400 mt-0.5">{eur(salary.newSaleRevenue)}</div>
              </div>
            ) : (
              <div />
            )}
            <div>
              <div className="text-xs text-neutral-500 mb-1">Sueldo estimado</div>
              <div className="text-2xl font-semibold">{hasComp ? eur(salary.total) : <span className="text-neutral-300">—</span>}</div>
            </div>
          </div>

          {hasComp ? (
            <div className="pl-2 border-t border-neutral-100 pt-3 mt-3">
              <div className="space-y-1 text-sm max-w-sm">
                {salary.config.baseSalary > 0 && (
                  <div className="flex justify-between"><span className="text-neutral-600">Sueldo fijo</span><span className="tabular-nums">{eur(salary.breakdown.fixed)}</span></div>
                )}
                {salary.config.perActivePatient > 0 && (
                  <div className="flex justify-between"><span className="text-neutral-600">Pacientes activos ({salary.activePatients} × {eur(salary.config.perActivePatient)})</span><span className="tabular-nums">{eur(salary.breakdown.patients)}</span></div>
                )}
                {(salary.config.renewalOwnPct > 0 || salary.config.renewalOthersPct > 0) && (
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Comisión renovaciones ({salary.config.renewalOwnPct}% propias{salary.config.renewalOthersPct > 0 ? ` + ${salary.config.renewalOthersPct}% equipo` : ""})</span>
                    <span className="tabular-nums">{eur(salary.breakdown.renewals)}</span>
                  </div>
                )}
                {salary.config.newSaleCommissionPct > 0 && (
                  <div className="flex justify-between"><span className="text-neutral-600">Comisión ventas ({salary.config.newSaleCommissionPct}%)</span><span className="tabular-nums">{eur(salary.breakdown.newSales)}</span></div>
                )}
                {salary.vacationDaysInMonth > 0 && (
                  <div className="flex justify-between" style={{ color: "#B45309" }}>
                    <span>
                      Descuento vacaciones ({salary.vacationDaysInMonth} {salary.vacationDaysInMonth === 1 ? "día" : "días"} de {salary.daysInMonth})
                    </span>
                    <span className="tabular-nums">{eur(salary.breakdown.vacation)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-neutral-200 pt-1.5 font-semibold"><span>Total estimado del mes</span><span className="tabular-nums">{eur(salary.total)}</span></div>
              </div>
            </div>
          ) : (
            <p className="pl-2 text-xs text-neutral-400 border-t border-neutral-100 pt-3 mt-3">
              Aún no tienes condiciones laborales configuradas.
            </p>
          )}
        </>
      )}

      {showRenewals && (
        <RenewalsModal
          label={label}
          loading={loadingRenewals}
          renewals={renewals ?? []}
          onClose={() => setShowRenewals(false)}
        />
      )}
    </section>
  );
}

function RenewalsModal({
  label, loading, renewals, onClose,
}: {
  label: string;
  loading: boolean;
  renewals: RenewalDetail[];
  onClose: () => void;
}) {
  const total = renewals.reduce((s, r) => s + (r.amountPaid ?? 0), 0);
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h3 className="font-medium">Renovaciones atribuidas · <span className="capitalize">{label}</span></h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Atribuidas por fecha de decisión (decidedAt) del follow-up. Solo pacientes asignados a ti.
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 text-xl px-2">✕</button>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="text-sm text-neutral-400 italic py-6 text-center">Cargando…</p>
          ) : renewals.length === 0 ? (
            <p className="text-sm text-neutral-400 italic py-6 text-center">
              No hay renovaciones atribuidas a este mes.
            </p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                    <th className="text-left py-2 px-2 font-medium">Paciente</th>
                    <th className="text-left py-2 px-2 font-medium">Programa</th>
                    <th className="text-right py-2 px-2 font-medium">Decidida</th>
                    <th className="text-right py-2 px-2 font-medium">Periodo</th>
                    <th className="text-right py-2 px-2 font-medium">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {renewals.map((r) => (
                    <tr key={`${r.patientId}-${r.attributionDate}`} className="border-b border-neutral-100 hover:bg-neutral-50">
                      <td className="py-2 px-2">
                        <Link href={`/fisio/paciente/${r.patientId}/suscripcion`} className="hover:underline font-medium">
                          {r.patientName}
                        </Link>
                        {r.notes && (
                          <div className="text-[10px] text-neutral-500 mt-0.5 italic">{r.notes}</div>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <span className="text-[10px] uppercase bg-neutral-100 text-neutral-700 border border-neutral-300 px-2 py-0.5 rounded-full font-medium">
                          {r.programType ?? "—"} · {r.periodMonths}M
                        </span>
                      </td>
                      <td className="text-right py-2 px-2 text-xs text-neutral-600 whitespace-nowrap">
                        {fmtDate(r.attributionDate)}
                      </td>
                      <td className="text-right py-2 px-2 text-[10px] text-neutral-500 whitespace-nowrap">
                        {fmtDate(r.startDate)} → {fmtDate(r.endDate)}
                      </td>
                      <td className="text-right py-2 px-2 font-medium text-emerald-700 tabular-nums">
                        {r.amountPaid != null ? eur(r.amountPaid) : <span className="text-neutral-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-neutral-300 font-semibold">
                    <td colSpan={4} className="py-2 px-2 text-right">
                      Total ({renewals.length} {renewals.length === 1 ? "renovación" : "renovaciones"})
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-emerald-700">
                      {eur(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
