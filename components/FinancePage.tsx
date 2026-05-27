"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";

type Period = "month" | "quarter" | "year";

type Summary = {
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
};

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
  return `${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;
}

export function FinancePage({
  year,
  period,
  periodLabel,
  summary,
  transactions,
  autoRenewals,
  yearTransactions,
  yearAutoRenewals,
  professionals,
  patients,
}: {
  year: number;
  period: Period;
  periodLabel: string;
  summary: Summary;
  transactions: Tx[];
  autoRenewals: Tx[];
  yearTransactions: YearTx[];
  yearAutoRenewals: YearAutoR[];
  professionals: Pro[];
  patients: Pat[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"dashboard" | "register">("dashboard");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);

  function switchPeriod(p: Period) {
    const url = new URL(window.location.href);
    url.searchParams.set("period", p);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  const allTx = useMemo(
    () => [...transactions, ...autoRenewals].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [transactions, autoRenewals]
  );
  const incomeTx = useMemo(() => allTx.filter((t) => t.type !== "expense"), [allTx]);
  const expenseTx = useMemo(() => allTx.filter((t) => t.type === "expense"), [allTx]);

  const pieData = [
    { name: "Nuevas altas", value: summary.incomeNew, color: "#10B981", count: summary.countNew },
    { name: "Renovaciones", value: summary.incomeRenewal, color: "#3B82F6", count: summary.countRenewal },
    { name: "Otros ingresos", value: summary.incomeOther, color: "#A855F7", count: summary.countOther },
  ].filter((d) => d.value > 0);

  return (
    <main>
      <header className="mb-4 flex justify-between items-end flex-wrap gap-2">
        <p className="text-xs text-neutral-500 capitalize">{periodLabel}</p>
        <div className="flex items-center gap-2">
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
          <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs">
            + Transacción
          </button>
        </div>
      </header>

      {/* Pestañas internas */}
      <div className="mb-4 flex gap-1 border-b border-neutral-200">
        <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")} label="📊 Panel de control" />
        <TabButton active={tab === "register"} onClick={() => setTab("register")} label="🧾 Registro" />
      </div>

      {tab === "dashboard" && (
        <>
          {/* KPIs principales */}
          <section className="card mb-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full" style={{ background: "linear-gradient(180deg, #FCD34D 0%, #F59E0B 100%)" }} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Ingresos</div>
                  <div className="text-2xl font-semibold text-emerald-700">{eur(summary.income)}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Gastos</div>
                  <div className="text-2xl font-semibold text-red-700">{eur(summary.expense)}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Beneficio</div>
                  <div className={`text-2xl font-semibold ${summary.profit >= 0 ? "text-neutral-900" : "text-red-700"}`}>
                    {eur(summary.profit)}
                  </div>
                  {summary.profitPct !== null && (
                    <div className={`text-xs mt-0.5 ${summary.profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {summary.profitPct >= 0 ? "+" : ""}{summary.profitPct}% sobre ingresos
                    </div>
                  )}
                </div>
              </div>

              <div className="border-l border-neutral-200 pl-4">
                <div className="text-xs text-neutral-500 mb-1">Origen de ingresos</div>
                {pieData.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic text-center py-8">Sin ingresos en este período</p>
                ) : (
                  <div className="flex items-center gap-3">
                    <div style={{ width: 120, height: 120 }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={pieData} dataKey="value" innerRadius={32} outerRadius={56} paddingAngle={2}>
                            {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip
                            formatter={(v: any) => eur(Number(v))}
                            contentStyle={{ fontSize: "12px", borderRadius: 8 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {pieData.map((d, i) => {
                        const pct = summary.income > 0 ? Math.round((d.value / summary.income) * 100) : 0;
                        return (
                          <div key={i} className="text-xs flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
                            <span className="text-neutral-700 flex-1">{d.name}</span>
                            <span className="font-medium tabular-nums">{pct}%</span>
                            <span className="text-neutral-400 text-[10px] tabular-nums">({d.count})</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Gráfico anual */}
          <YearChart
            year={year}
            yearTransactions={yearTransactions}
            yearAutoRenewals={yearAutoRenewals}
          />
        </>
      )}

      {tab === "register" && (
        <section className="card">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h2 className="font-medium text-sm">Transacciones del período</h2>
              <p className="text-xs text-neutral-500">{allTx.length} movimientos · click para editar</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <div className="flex items-baseline justify-between mb-2 pb-1.5 border-b-2 border-emerald-200">
                <h3 className="font-semibold text-sm text-emerald-700">Ingresos</h3>
                <span className="text-xs text-neutral-500">{incomeTx.length} · <span className="font-medium text-emerald-700">{eur(summary.income)}</span></span>
              </div>
              <TxTable rows={incomeTx} onEdit={setEditing} emptyText="Sin ingresos en este período." />
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-2 pb-1.5 border-b-2 border-red-200">
                <h3 className="font-semibold text-sm text-red-700">Gastos</h3>
                <span className="text-xs text-neutral-500">{expenseTx.length} · <span className="font-medium text-red-700">{eur(summary.expense)}</span></span>
              </div>
              <TxTable rows={expenseTx} onEdit={setEditing} emptyText="Sin gastos en este período." />
            </div>
          </div>
        </section>
      )}

      {(showNew || editing) && (
        <TransactionModal
          editingTx={editing}
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

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
      }`}
    >
      {label}
    </button>
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
      const m = new Date(t.occurredAt).getMonth();
      if (t.type === "expense") {
        const cat = t.category ?? "otros";
        if (!activeExpenseCats.has(cat)) continue;
        months[m].gastos += t.amount;
      } else {
        if (!activeIncomeTypes.has(t.type)) continue;
        months[m].ingresos += t.amount;
      }
    }
    // Auto renewals (renovaciones automáticas) cuentan como income_renewal
    if (activeIncomeTypes.has("income_renewal")) {
      for (const r of yearAutoRenewals) {
        const m = new Date(r.occurredAt).getMonth();
        months[m].ingresos += r.amount;
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
          <p className="text-xs text-neutral-500">Ingresos, gastos y beneficio mes a mes</p>
        </div>
        <div className="flex gap-1">
          <ToggleChip active={showIncome} onClick={() => setShowIncome((v) => !v)} color="emerald" label="Ingresos" />
          <ToggleChip active={showExpense} onClick={() => setShowExpense((v) => !v)} color="red" label="Gastos" />
          <ToggleChip active={showProfit} onClick={() => setShowProfit((v) => !v)} color="blue" label="Beneficio" />
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
            {showIncome && <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />}
            {showExpense && <Line type="monotone" dataKey="gastos" name="Gastos" stroke="#DC2626" strokeWidth={2} dot={{ r: 3 }} />}
            {showProfit && <Line type="monotone" dataKey="beneficio" name="Beneficio" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />}
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
  professionals,
  patients,
  onClose,
  onSaved,
}: {
  editingTx: Tx | null;
  professionals: Pro[];
  patients: Pat[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editingTx;
  const [type, setType] = useState<"income_new" | "income_renewal" | "income_other" | "expense">(
    (editingTx?.type as any) ?? "income_new"
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
function TxTable({ rows, onEdit, emptyText }: { rows: Tx[]; onEdit: (t: Tx) => void; emptyText: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-400 text-center py-6 italic">{emptyText}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
            <th className="text-left py-2 px-2 font-medium">Fecha</th>
            <th className="text-left py-2 px-2 font-medium">Concepto</th>
            <th className="text-right py-2 px-2 font-medium">Importe</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const isExpense = t.type === "expense";
            const isEditable = t.source === "manual";
            const who = [t.patient?.fullName, t.professional?.fullName.split(" ")[0]].filter(Boolean).join(" · ");
            return (
              <tr
                key={t.id}
                onClick={() => isEditable && onEdit(t)}
                className={`border-b border-neutral-100 ${isEditable ? "hover:bg-neutral-50 cursor-pointer" : "opacity-90"}`}
                title={isEditable ? "Click para editar" : "Automático (se edita desde la ficha del paciente)"}
              >
                <td className="py-2 px-2 text-xs text-neutral-500 whitespace-nowrap align-top">
                  {new Date(t.occurredAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                </td>
                <td className="py-2 px-2 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${TYPE_COLORS[t.type] ?? "bg-neutral-100"}`}>
                      {TYPE_LABELS[t.type] ?? t.type}
                    </span>
                    {t.source === "auto" && <span className="text-[10px] text-neutral-400 italic">auto</span>}
                  </div>
                  <div className="mt-0.5">
                    {t.category && <span className="text-neutral-500">{EXPENSE_CAT_LABELS[t.category] ?? t.category}</span>}
                    {t.category && t.description && <span className="text-neutral-300"> · </span>}
                    {t.description}
                  </div>
                  {who && <div className="text-[11px] text-neutral-400 mt-0.5">{who}</div>}
                </td>
                <td className={`py-2 px-2 text-right tabular-nums font-medium align-top ${isExpense ? "text-red-700" : "text-emerald-700"}`}>
                  {isExpense ? "−" : "+"}{eur(t.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
