"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { FinanceSummary } from "@/lib/finance";
import {
  ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";

type Period = "month" | "quarter" | "year";

type Summary = FinanceSummary;
type BilledRow = { id: string; type: string; amount: number; occurredAt: string; patientName: string | null; programType: string | null; };

type Pro = { id: string; fullName: string; role: string };
type Pat = { id: string; fullName: string };

type Tx = {
  id: string;
  type: string;
  category: string | null;
  amount: number;
  description: string | null;
  occurredAt: string;
  professional: Pro | null;
  patient: Pat | null;
  source: "manual" | "auto";
};

type YearTx = { type: string; category: string | null; amount: number; occurredAt: string };
type YearAutoR = { amount: number; occurredAt: string };

const TYPE_LABELS: Record<string, string> = {
  income_new: "Nueva alta",
  income_renewal: "Renovación",
  income_other: "Otros ingresos",
  expense: "Gasto",
};

const TYPE_COLORS: Record<string, string> = {
  income_new: "bg-emerald-100 text-emerald-800",
  income_renewal: "bg-blue-100 text-blue-800",
  income_other: "bg-purple-100 text-purple-800",
  expense: "bg-red-100 text-red-800",
};

const EXPENSE_CATEGORIES = ["software", "sueldos", "marketing", "otros"] as const;
const EXPENSE_CAT_LABELS: Record<string, string> = {
  software: "Software",
  sueldos: "Sueldos",
  marketing: "Marketing",
  otros: "Otros",
};

const INCOME_TYPES = ["income_new", "income_renewal", "income_other"] as const;
const MONTH_NAMES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function eur(n: number): string {
  return `${n.toLocaleString("es-ES", { maximumFractionDigits: 2 })} €`;
}

export function FinancePage({
  year,
  period,
  periodLabel,
  summary,
  transactions,
  autoRenewals,
  billedEntries = [],
  yearTransactions,
  yearAutoRenewals,
  professionals,
  patients,
  hidePeriodControls = false,
}: {
  year: number;
  period: Period;
  periodLabel: string;
  summary: Summary;
  transactions: Tx[];
  autoRenewals: Tx[];
  billedEntries?: BilledRow[];
  yearTransactions: YearTx[];
  yearAutoRenewals: YearAutoR[];
  professionals: Pro[];
  patients: Pat[];
  hidePeriodControls?: boolean;
}) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [initialType, setInitialType] = useState<"income_new" | "expense">("income_new");
  const [editing, setEditing] = useState<Tx | null>(null);

  function switchPeriod(p: Period) {
    const url = new URL(window.location.href);
    url.searchParams.set("period", p);
    url.searchParams.delete("specificMonth");
    router.push(url.pathname + url.search);
    router.refresh();
  }

  function openNew(type: "income_new" | "expense") {
    setInitialType(type);
    setShowNew(true);
  }

  const allTx = useMemo(
    () => [...transactions].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [transactions]
  );
  const incomeTx = useMemo(() => allTx.filter((t) => t.type !== "expense"), [allTx]);
  const expenseTx = useMemo(() => allTx.filter((t) => t.type === "expense"), [allTx]);
  const expenseCategories = useMemo(() => {
    const totals = new Map<string, number>();
    for (const tx of expenseTx) {
      const category = tx.category ?? "otros";
      totals.set(category, (totals.get(category) ?? 0) + tx.amount);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenseTx]);

  const incomeCategories = [
    { label: "Nuevas altas", total: summary.incomeNew, count: summary.collectedCountNew },
    { label: "Renovaciones", total: summary.incomeRenewal, count: summary.collectedCountRenewal },
    { label: "Otros ingresos", total: summary.incomeOther, count: summary.collectedCountOther },
  ].filter((category) => category.total !== 0 || category.count > 0);

  return (
    <main className="space-y-4">
      <header className="flex justify-between items-center flex-wrap gap-3">
        {!hidePeriodControls ? (
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs text-neutral-500 capitalize">{periodLabel}</p>
            <div className="flex bg-neutral-100 rounded-lg p-0.5">
              {(["month", "quarter", "year"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => switchPeriod(p)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    period === p ? "bg-white shadow-sm font-medium" : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  {p === "month" ? "Mensual" : p === "quarter" ? "Trimestral" : "Anual"}
                </button>
              ))}
            </div>
          </div>
        ) : <p className="text-xs text-neutral-500">Ingresos, gastos y movimientos del período</p>}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => openNew("income_new")} className="btn btn-primary text-xs">
            + Añadir ingreso
          </button>
          <button onClick={() => openNew("expense")} className="btn text-xs border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50">
            + Añadir gasto
          </button>
        </div>
      </header>

      <section aria-label="Resultado del período" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <FinanceKpi label="Facturación" value={summary.billed} tone="income" sub="Importe completo de contratos confirmados" />
        <FinanceKpi label="Recaudado" value={summary.income} tone="income" sub="Cobros registrados durante el período" />
        <FinanceKpi label="Gastos" value={summary.expense} tone="expense" />
        <FinanceKpi
          label="Resultado de caja"
          value={summary.profit}
          tone={summary.profit < 0 ? "expense" : "neutral"}
          sub={summary.profitPct !== null ? `${summary.profitPct}% sobre recaudado` : undefined}
        />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <h2 className="px-4 py-3 border-b border-neutral-200 text-sm font-semibold">Recaudado por categoría</h2>
          <div className="p-4">
            {incomeCategories.length > 0 ? incomeCategories.map((category) => (
              <div key={category.label} className="flex justify-between items-baseline gap-3 py-2 border-b border-neutral-100 last:border-0 text-sm">
                <span className="text-neutral-700">{category.label} <span className="text-xs text-neutral-400">({category.count})</span></span>
                <span className="tabular-nums font-medium whitespace-nowrap">{eur(category.total)}</span>
              </div>
            )) : <p className="text-sm text-neutral-500">Sin ingresos en este período.</p>}
          </div>
        </section>
        <section className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <h2 className="px-4 py-3 border-b border-neutral-200 text-sm font-semibold">Gastos por categoría</h2>
          <div className="p-4">
            {expenseCategories.length > 0 ? expenseCategories.map(([category, total]) => (
              <div key={category} className="flex justify-between items-baseline gap-3 py-2 border-b border-neutral-100 last:border-0 text-sm">
                <span className="text-neutral-700">{EXPENSE_CAT_LABELS[category] ?? category}</span>
                <span className="tabular-nums font-medium whitespace-nowrap">{eur(total)}</span>
              </div>
            )) : <p className="text-sm text-neutral-500">Sin gastos en este período.</p>}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        <h2 className="px-4 py-3 border-b border-neutral-200 text-sm font-semibold">Facturación de contratos</h2>
        <p className="px-4 pt-3 text-xs text-neutral-500">El importe completo se cuenta una sola vez. Las cuotas se registran aparte en el recaudado de cada mes.</p>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-sm"><thead className="bg-neutral-50 text-xs text-neutral-500"><tr><th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-left">Paciente / programa</th><th className="px-3 py-2 text-right">Importe completo</th></tr></thead>
            <tbody>{billedEntries.length ? billedEntries.map((entry) => <tr key={entry.id} className="border-b border-neutral-100"><td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(entry.occurredAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" })}</td><td className="px-3 py-2 text-xs">{entry.patientName || "Registro manual"}{entry.programType ? ` · ${entry.programType}` : ""}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{eur(entry.amount)}</td></tr>) : <tr><td colSpan={3} className="px-3 py-6 text-center text-xs text-neutral-500">Sin contratos facturados en este período.</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        <header className="flex justify-between items-center flex-wrap gap-2 px-4 py-3 border-b border-neutral-200">
          <h2 className="font-semibold text-sm">Movimientos del período <span className="font-normal text-neutral-500">({allTx.length})</span></h2>
          <p className="text-xs text-neutral-500">Los movimientos manuales se pueden editar</p>
        </header>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 p-4">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h3 className="font-medium text-sm">Cobros</h3>
              <span className="text-xs text-neutral-500">{incomeTx.length} movimientos · <span className="font-medium text-emerald-700">{eur(summary.income)}</span></span>
            </div>
            <TxTable rows={incomeTx} kind="income" onEdit={setEditing} emptyText="Sin ingresos en este período." />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h3 className="font-medium text-sm">Gastos</h3>
              <span className="text-xs text-neutral-500">{expenseTx.length} movimientos · <span className="font-medium text-red-700">{eur(summary.expense)}</span></span>
            </div>
            <TxTable rows={expenseTx} kind="expense" onEdit={setEditing} emptyText="Sin gastos en este período." />
          </div>
        </div>
      </section>

      {autoRenewals.length > 0 && <details className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <summary className="cursor-pointer text-sm font-medium">Importes históricos por comprobar ({autoRenewals.length})</summary>
        <p className="my-3 text-xs text-neutral-600">Se conservan estos importes de periodos antiguos. No se consideran dinero recaudado sin un cobro registrado.</p>
        <TxTable rows={autoRenewals} kind="income" onEdit={() => {}} emptyText="" />
      </details>}

      <details className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Gráfico anual con filtros · {year}</summary>
        <YearChart year={year} yearTransactions={yearTransactions} yearAutoRenewals={yearAutoRenewals} />
      </details>

      {(showNew || editing) && (
        <TransactionModal
          editingTx={editing}
          initialType={initialType}
          professionals={professionals}
          patients={patients}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => {
            setShowNew(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function FinanceKpi({ label, value, tone, sub }: { label: string; value: number; tone: "income" | "expense" | "neutral"; sub?: string }) {
  const color = tone === "income" ? "text-emerald-700" : tone === "expense" ? "text-red-700" : "text-neutral-900";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 sm:p-4 min-w-0">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-1 text-[22px] sm:text-2xl leading-8 font-semibold tabular-nums break-words ${color}`}>{eur(value)}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

// ============================================================================
// Gráfico anual de líneas con filtros
// ============================================================================

function YearChart({
  year,
  yearTransactions,
  yearAutoRenewals,
}: {
  year: number;
  yearTransactions: YearTx[];
  yearAutoRenewals: YearAutoR[];
}) {
  const [showIncome, setShowIncome] = useState(true);
  const [showExpense, setShowExpense] = useState(true);
  const [showProfit, setShowProfit] = useState(true);
  const [activeExpenseCats, setActiveExpenseCats] = useState<Set<string>>(new Set(EXPENSE_CATEGORIES));
  const [activeIncomeTypes, setActiveIncomeTypes] = useState<Set<string>>(new Set([...INCOME_TYPES]));

  function toggleExpenseCat(c: string) {
    const next = new Set(activeExpenseCats);
    if (next.has(c)) next.delete(c); else next.add(c);
    setActiveExpenseCats(next);
  }

  function toggleIncomeType(t: string) {
    const next = new Set(activeIncomeTypes);
    if (next.has(t)) next.delete(t); else next.add(t);
    setActiveIncomeTypes(next);
  }

  // Construir dataset mensual
  const data = useMemo(() => {
    const months = MONTH_NAMES.map((label, i) => ({
      label,
      monthIndex: i,
      ingresos: 0,
      gastos: 0,
      beneficio: 0,
    }));

    for (const t of yearTransactions) {
      const m = new Date(t.occurredAt).getUTCMonth();
      if (t.type === "expense") {
        const cat = t.category ?? "otros";
        if (!activeExpenseCats.has(cat)) continue;
        months[m].gastos += t.amount;
      } else {
        if (!activeIncomeTypes.has(t.type)) continue;
        months[m].ingresos += t.amount;
      }
    }

    for (const m of months) {
      m.beneficio = m.ingresos - m.gastos;
    }

    return months;
  }, [yearTransactions, yearAutoRenewals, activeExpenseCats, activeIncomeTypes]);

  return (
    <section className="card">
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div>
          <h2 className="font-medium text-sm">Tendencia anual — {year}</h2>
          <p className="text-xs text-neutral-500">Recaudado, gastos y resultado de caja mes a mes</p>
        </div>
        <div className="flex gap-1">
          <ToggleChip active={showIncome} onClick={() => setShowIncome((v) => !v)} color="emerald" label="Recaudado" />
          <ToggleChip active={showExpense} onClick={() => setShowExpense((v) => !v)} color="red" label="Gastos" />
          <ToggleChip active={showProfit} onClick={() => setShowProfit((v) => !v)} color="blue" label="Resultado de caja" />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-3">
        <div>
          <p className="text-[10px] uppercase text-neutral-500 font-medium mb-1">Tipos de ingreso</p>
          <div className="flex gap-1 flex-wrap">
            {INCOME_TYPES.map((t) => (
              <FilterChip
                key={t}
                active={activeIncomeTypes.has(t)}
                onClick={() => toggleIncomeType(t)}
                label={TYPE_LABELS[t]}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase text-neutral-500 font-medium mb-1">Categorías de gasto</p>
          <div className="flex gap-1 flex-wrap">
            {EXPENSE_CATEGORIES.map((c) => (
              <FilterChip
                key={c}
                active={activeExpenseCats.has(c)}
                onClick={() => toggleExpenseCat(c)}
                label={EXPENSE_CAT_LABELS[c]}
              />
            ))}
          </div>
        </div>
      </div>

      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(v: any) => eur(Number(v))}
              contentStyle={{ fontSize: "12px", borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            {showIncome && <Line type="monotone" dataKey="ingresos" name="Recaudado" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />}
            {showExpense && <Line type="monotone" dataKey="gastos" name="Gastos" stroke="#DC2626" strokeWidth={2} dot={{ r: 3 }} />}
            {showProfit && <Line type="monotone" dataKey="beneficio" name="Resultado de caja" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-neutral-400 italic mt-2 text-center">
        💡 Click en las leyendas o etiquetas para filtrar
      </p>
    </section>
  );
}

function ToggleChip({ active, onClick, color, label }: { active: boolean; onClick: () => void; color: "emerald" | "red" | "blue"; label: string }) {
  const colors = {
    emerald: active ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-white border-neutral-200 text-neutral-400",
    red: active ? "bg-red-100 text-red-800 border-red-300" : "bg-white border-neutral-200 text-neutral-400",
    blue: active ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-white border-neutral-200 text-neutral-400",
  };
  return (
    <button onClick={onClick} className={`text-xs px-2 py-1 rounded-full border font-medium ${colors[color]}`}>
      {active ? "✓ " : ""}{label}
    </button>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded-full border ${
        active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200 text-neutral-400 hover:text-neutral-700"
      }`}
    >
      {label}
    </button>
  );
}

// ============================================================================
// Modal de transacción (crear y editar)
// ============================================================================

function TransactionModal({
  editingTx,
  initialType,
  professionals,
  patients,
  onClose,
  onSaved,
}: {
  editingTx: Tx | null;
  initialType: "income_new" | "expense";
  professionals: Pro[];
  patients: Pat[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editingTx;
  const [type, setType] = useState<"income_new" | "income_renewal" | "income_other" | "expense">(
    (editingTx?.type as any) ?? initialType
  );
  const [category, setCategory] = useState(editingTx?.category ?? "software");
  const [amount, setAmount] = useState(editingTx ? String(editingTx.amount) : "");
  const [description, setDescription] = useState(editingTx?.description ?? "");
  const [occurredAt, setOccurredAt] = useState(
    editingTx ? editingTx.occurredAt.split("T")[0] : new Date().toISOString().split("T")[0]
  );
  const [professionalId, setProfessionalId] = useState(editingTx?.professional?.id ?? "");
  const [patientId, setPatientId] = useState(editingTx?.patient?.id ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!amount || Number(amount) <= 0) return;
    setSaving(true);
    const payload = {
      ...(isEdit && { id: editingTx!.id }),
      type,
      category: type === "expense" ? category : null,
      amount,
      description,
      occurredAt,
      professionalId: professionalId || null,
      patientId: patientId || null,
    };
    await fetch("/api/transactions", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    onSaved();
  }

  async function remove() {
    if (!editingTx) return;
    if (!confirm("¿Eliminar esta transacción?")) return;
    setSaving(true);
    await fetch(`/api/transactions?id=${editingTx.id}`, { method: "DELETE" });
    onSaved();
  }

  const isExpense = type === "expense";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">{isEdit ? "Editar transacción" : "Nueva transacción"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Tipo</label>
            <div className="grid grid-cols-2 gap-1">
              {([
                ["income_new", "💚 Nueva alta"],
                ["income_renewal", "🔄 Renovación"],
                ["income_other", "✨ Otros ingresos"],
                ["expense", "💸 Gasto"],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setType(k)}
                  className={`px-3 py-2 text-xs rounded border ${
                    type === k ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200 hover:bg-neutral-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isExpense && (
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Categoría del gasto</label>
              <select className="input text-sm" value={category ?? "otros"} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{EXPENSE_CAT_LABELS[c]}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Importe (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input text-sm"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Fecha</label>
              <input type="date" className="input text-sm" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Concepto / descripción</label>
            <input
              className="input text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isExpense ? "Ej: Suscripción Notion" : "Ej: Alta de Iván"}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Profesional (opcional)</label>
              <select className="input text-sm" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
                <option value="">— Ninguno —</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Paciente (opcional)</label>
              <select className="input text-sm" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                <option value="">— Ninguno —</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            {isEdit && (
              <button onClick={remove} disabled={saving} className="text-xs text-red-600">
                🗑️ Eliminar
              </button>
            )}
            <button
              onClick={save}
              disabled={!amount || saving}
              className="btn btn-primary ml-auto"
            >
              {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Registrar transacción"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Tabla de transacciones (reutilizada para Ingresos y Gastos por separado).
function TxTable({ rows, kind, onEdit, emptyText }: { rows: Tx[]; kind: "income" | "expense"; onEdit: (t: Tx) => void; emptyText: string }) {
  const [filter, setFilter] = useState<string>("all");
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-400 text-center py-6 italic">{emptyText}</p>;
  }
  const tagOf = (t: Tx) => (kind === "income" ? t.type : t.category ?? "otros");
  const labelOf = (tag: string) => (kind === "income" ? TYPE_LABELS[tag] ?? tag : EXPENSE_CAT_LABELS[tag] ?? tag);
  const tags = [...new Set(rows.map(tagOf))];
  const shown = filter === "all" ? rows : rows.filter((t) => tagOf(t) === filter);
  const shownTotal = shown.reduce((a, t) => a + t.amount, 0);

  return (
    <div className="overflow-x-auto">
      {tags.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-2">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="Todo" />
          {tags.map((tag) => (
            <FilterChip key={tag} active={filter === tag} onClick={() => setFilter(tag)} label={labelOf(tag)} />
          ))}
        </div>
      )}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs text-neutral-500 bg-neutral-50 border-b border-neutral-200">
            <th className="text-left py-2 px-2 font-medium">Fecha</th>
            <th className="text-left py-2 px-2 font-medium">Concepto</th>
            <th className="text-left py-2 px-2 font-medium">Categoría</th>
            <th className="text-right py-2 px-2 font-medium">Importe</th>
            <th className="text-right py-2 px-2 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t) => {
            const isExpense = t.type === "expense";
            const isEditable = t.source === "manual";
            const who = [t.patient?.fullName, t.professional?.fullName.split(" ")[0]].filter(Boolean).join(" · ");
            return (
              <tr
                key={t.id}
                onClick={() => isEditable && onEdit(t)}
                className={`border-b border-neutral-100 ${isEditable ? "hover:bg-neutral-50 cursor-pointer" : "opacity-90"}`}
                title={isEditable ? "Click para editar" : "Cobro confirmado por el proveedor de pago"}
              >
                <td className="py-2 px-2 text-xs text-neutral-500 whitespace-nowrap align-top">
                  {new Date(t.occurredAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                </td>
                <td className="py-2 px-2 text-xs">
                  <div className="text-neutral-700">{t.description || TYPE_LABELS[t.type] || t.type}</div>
                  {who && <div className="text-[11px] text-neutral-400 mt-0.5">{who}</div>}
                </td>
                <td className="py-2 px-2 text-xs align-top">
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full ${isExpense ? "bg-neutral-100 text-neutral-600" : TYPE_COLORS[t.type] ?? "bg-neutral-100"}`}>
                    {isExpense ? EXPENSE_CAT_LABELS[t.category ?? "otros"] ?? t.category : TYPE_LABELS[t.type] ?? t.type}
                  </span>
                </td>
                <td className={`py-2 px-2 text-right tabular-nums font-medium align-top ${isExpense ? "text-red-700" : "text-emerald-700"}`}>
                  {isExpense ? "−" : "+"}{eur(t.amount)}
                </td>
                <td className="py-2 px-2 text-right align-top">
                  {isEditable ? (
                    <button
                      onClick={(event) => { event.stopPropagation(); onEdit(t); }}
                      className="text-xs text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
                      aria-label={`Editar ${t.description || TYPE_LABELS[t.type] || "movimiento"}`}
                    >
                      Editar
                    </button>
                  ) : <span className="text-[10px] text-neutral-400">Automático</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
        {filter !== "all" && (
          <tfoot>
            <tr className="border-t border-neutral-200">
              <td className="py-2 px-2 text-xs text-neutral-500" colSpan={3}>{labelOf(filter)} · {shown.length}</td>
              <td className={`py-2 px-2 text-right tabular-nums font-semibold ${kind === "expense" ? "text-red-700" : "text-emerald-700"}`}>
                {kind === "expense" ? "−" : "+"}{eur(shownTotal)}
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
