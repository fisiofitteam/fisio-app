"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Row = { id: string; fullName: string; role: string; total: number; paid: boolean };

const ROLE_LABELS: Record<string, string> = {
  ceo: "CEO", head_success: "Head of Success", fisio: "Fisioterapeuta", setter: "Setter", closer: "Closer",
};

function eur(n: number) {
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0 });
}

export function PayrollView({ year, month, rows }: { year: number; month: number; rows: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

  function goMonth(delta: number) {
    let y = year, m = month + delta;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    router.push(`/fisio/finanzas/facturas?year=${y}&month=${m}`);
  }

  async function markPaid(r: Row) {
    setBusy(r.id);
    const res = await fetch("/api/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professionalId: r.id, year, month }),
    });
    setBusy(null);
    if (res.ok) router.refresh();
    else alert("No se pudo marcar como pagada");
  }

  async function undo(r: Row) {
    if (!confirm(`¿Deshacer el pago de ${r.fullName}? Se eliminará el gasto asociado.`)) return;
    setBusy(r.id);
    const res = await fetch(`/api/payroll?professionalId=${r.id}&year=${year}&month=${month}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) router.refresh();
    else alert("No se pudo deshacer");
  }

  const totalMonth = rows.reduce((s, r) => s + r.total, 0);
  const totalPaid = rows.filter((r) => r.paid).reduce((s, r) => s + r.total, 0);
  const totalPending = totalMonth - totalPaid;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-xl font-semibold">Facturas del equipo</h1>
          <p className="text-xs text-neutral-500 mt-0.5 capitalize">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => goMonth(-1)} className="text-sm px-2 py-1 border border-neutral-200 rounded hover:bg-neutral-50">← Mes anterior</button>
          <button onClick={() => goMonth(1)} className="text-sm px-2 py-1 border border-neutral-200 rounded hover:bg-neutral-50">Mes siguiente →</button>
        </div>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card"><div className="text-xs text-neutral-500 mb-1">Nómina del mes</div><div className="text-xl font-semibold tabular-nums">{eur(totalMonth)}</div></div>
        <div className="card"><div className="text-xs text-neutral-500 mb-1">Pagado</div><div className="text-xl font-semibold text-emerald-700 tabular-nums">{eur(totalPaid)}</div></div>
        <div className="card"><div className="text-xs text-neutral-500 mb-1">Pendiente</div><div className="text-xl font-semibold text-amber-700 tabular-nums">{eur(totalPending)}</div></div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-12">
          Ningún miembro tiene condiciones laborales configuradas. Configúralas en Equipo → Miembros → ⚙️ Condiciones.
        </p>
      ) : (
        <section className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                <th className="text-left py-2 px-2 font-medium">Miembro</th>
                <th className="text-left py-2 px-2 font-medium">Rol</th>
                <th className="text-right py-2 px-2 font-medium">Total mes</th>
                <th className="text-center py-2 px-2 font-medium">Estado</th>
                <th className="text-right py-2 px-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-100">
                  <td className="py-2.5 px-2 font-medium">{r.fullName}</td>
                  <td className="py-2.5 px-2 text-neutral-500">{ROLE_LABELS[r.role] ?? r.role}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-medium">{eur(r.total)}</td>
                  <td className="py-2.5 px-2 text-center">
                    {r.paid ? (
                      <span className="text-[10px] uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">✓ Pagada</span>
                    ) : (
                      <span className="text-[10px] uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Pendiente</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right whitespace-nowrap">
                    <Link href={`/fisio/factura/${r.id}?year=${year}&month=${month}`} className="text-[11px] text-blue-600 hover:underline mr-3">
                      Ver factura
                    </Link>
                    {r.paid ? (
                      <button onClick={() => undo(r)} disabled={busy === r.id} className="text-[11px] text-neutral-500 hover:underline">
                        Deshacer
                      </button>
                    ) : (
                      <button onClick={() => markPaid(r)} disabled={busy === r.id} className="text-[11px] font-medium text-emerald-700 hover:underline">
                        {busy === r.id ? "..." : "Marcar pagada"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-[11px] text-neutral-400 mt-3">
        Al marcar una nómina como pagada se registra automáticamente como gasto ("sueldos") en las transacciones del mes.
      </p>
    </div>
  );
}
