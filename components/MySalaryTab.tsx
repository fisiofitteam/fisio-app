"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Salary = {
  config: { baseSalary: number; perActivePatient: number; renewalOwnPct: number; renewalOthersPct: number; newSaleCommissionPct: number };
  breakdown: { fixed: number; patients: number; renewals: number; newSales: number };
  activePatients: number;
  renewalOwnCount: number;
  renewalOwnRevenue: number;
  newSaleCount: number;
  newSaleRevenue: number;
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

export function MySalaryTab({ professionalId }: { professionalId: string }) {
  const months = lastMonths(12);
  const [sel, setSel] = useState(0); // índice en months (0 = mes actual)
  const [salary, setSalary] = useState<Salary | null>(null);
  const [loading, setLoading] = useState(true);

  const { year, month, label } = months[sel];
  const isCurrent = sel === 0;

  useEffect(() => {
    setLoading(true);
    fetch(`/api/my-salary?year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setSalary(s))
      .finally(() => setLoading(false));
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
            <div>
              <div className="text-xs text-neutral-500 mb-1">Renovaciones (mes)</div>
              <div className="text-2xl font-semibold text-emerald-700">{salary.renewalOwnCount}</div>
              <div className="text-xs text-neutral-400 mt-0.5">{eur(salary.renewalOwnRevenue)}</div>
            </div>
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
    </section>
  );
}
