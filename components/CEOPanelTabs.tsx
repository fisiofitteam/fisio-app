"use client";

import { useState } from "react";
import Link from "next/link";
import { CeoPersonalView } from "@/components/CeoPersonalView";

type FinanceResumen = {
  income: number;
  expense: number;
  profit: number;
  profitPct: number | null;
  incomeNew: number;
  incomeRenewal: number;
  incomeOther: number;
  countNew: number;
  countRenewal: number;
  countOther: number;
  periodLabel: string;
};

function eur(n: number): string {
  return `${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;
}

export function CEOPanelTabs({
  teamBlock,
  salesBlock,
  finance,
  userFullName,
}: {
  teamBlock: React.ReactNode;
  salesBlock: React.ReactNode;
  finance: FinanceResumen;
  userFullName: string;
}) {
  const [tab, setTab] = useState<"mi-ceo" | "team" | "sales" | "finance">("mi-ceo");

  return (
    <>
      <div className="mb-4 flex gap-1 border-b border-neutral-200 overflow-x-auto">
        <TabButton active={tab === "mi-ceo"} onClick={() => setTab("mi-ceo")} label="🎯 Mi CEO" />
        <TabButton active={tab === "sales"} onClick={() => setTab("sales")} label="📈 Métricas de venta" />
        <TabButton active={tab === "team"} onClick={() => setTab("team")} label="📊 Métricas equipo" />
        <TabButton active={tab === "finance"} onClick={() => setTab("finance")} label="💰 Finanzas" />
      </div>

      {tab === "mi-ceo" && <CeoPersonalView userFullName={userFullName} />}
      {tab === "sales" && salesBlock}
      {tab === "team" && teamBlock}

      {tab === "finance" && (
        <>
          <section className="card mb-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full" style={{ background: "linear-gradient(180deg, #FCD34D 0%, #F59E0B 100%)" }} />
            <div className="flex justify-between items-center mb-3 pl-2">
              <div>
                <h2 className="font-medium text-sm">Finanzas — resumen del mes</h2>
                <p className="text-xs text-neutral-500 capitalize">{finance.periodLabel}</p>
              </div>
              <Link href="/fisio/finanzas" className="text-xs text-neutral-500 hover:text-neutral-900">
                Ver todo →
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-3 pl-2">
              <div>
                <div className="text-xs text-neutral-500 mb-1">Ingresos</div>
                <div className="text-2xl font-semibold text-emerald-700">{eur(finance.income)}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">Gastos</div>
                <div className="text-2xl font-semibold text-red-700">{eur(finance.expense)}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500 mb-1">Beneficio</div>
                <div className={`text-2xl font-semibold ${finance.profit >= 0 ? "text-neutral-900" : "text-red-700"}`}>
                  {eur(finance.profit)}
                </div>
                {finance.profitPct !== null && (
                  <div className={`text-xs mt-0.5 ${finance.profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {finance.profitPct >= 0 ? "+" : ""}{finance.profitPct}%
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <SourceCard label="Nuevas altas" amount={finance.incomeNew} count={finance.countNew} color="emerald" />
            <SourceCard label="Renovaciones" amount={finance.incomeRenewal} count={finance.countRenewal} color="blue" />
            <SourceCard label="Otros ingresos" amount={finance.incomeOther} count={finance.countOther} color="purple" />
          </div>

          <p className="text-xs text-neutral-500 italic mt-3 text-center">
            Ver el detalle completo, registrar transacciones y cambiar de período en{" "}
            <Link href="/fisio/finanzas" className="underline">Finanzas →</Link>
          </p>
        </>
      )}
    </>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
      }`}
    >
      {label}
    </button>
  );
}

function SourceCard({ label, amount, count, color }: { label: string; amount: number; count: number; color: "emerald" | "blue" | "purple" }) {
  const colors = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
    blue: "bg-blue-50 border-blue-200 text-blue-900",
    purple: "bg-purple-50 border-purple-200 text-purple-900",
  };
  return (
    <div className={`rounded-lg p-3 border ${colors[color]}`}>
      <div className="text-xs opacity-75">{label}</div>
      <div className="text-lg font-semibold mt-1">{eur(amount)}</div>
      <div className="text-xs opacity-60 mt-0.5">{count} transacc.</div>
    </div>
  );
}
