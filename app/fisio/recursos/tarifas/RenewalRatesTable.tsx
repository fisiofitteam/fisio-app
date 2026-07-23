"use client";

import { useState } from "react";
import { Plus, Trash2, Save, X } from "lucide-react";

type Rate = {
  id: string;
  programType: string;
  periodMonths: number;
  amount: number;
  currency: string;
  notes: string | null;
};

const PROGRAMS = [
  { key: "RECUPERA", label: "RECUPERA" },
  { key: "CONSOLIDA", label: "CONSOLIDA" },
  { key: "ADVANCE", label: "ADVANCE" },
  { key: "PREVENTION", label: "PREVENTION" },
];

const PROGRAM_COLORS: Record<string, { bg: string; text: string }> = {
  RECUPERA: { bg: "#DBEAFE", text: "#1E40AF" },
  CONSOLIDA: { bg: "#DCFCE7", text: "#166534" },
  ADVANCE: { bg: "#FEF3C7", text: "#78350F" },
  PREVENTION: { bg: "#F3E8FF", text: "#6B21A8" },
};

export function RenewalRatesTable({ initial, canEdit }: { initial: Rate[]; canEdit: boolean }) {
  const [rates, setRates] = useState<Rate[]>(initial);
  const [adding, setAdding] = useState(false);

  function groupByProgram(): Record<string, Rate[]> {
    const g: Record<string, Rate[]> = {};
    for (const p of PROGRAMS) g[p.key] = [];
    for (const r of rates) {
      if (!g[r.programType]) g[r.programType] = [];
      g[r.programType].push(r);
    }
    return g;
  }
  const grouped = groupByProgram();

  async function saveRate(rate: Omit<Rate, "id"> & { id?: string }) {
    const r = await fetch("/api/renewal-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rate),
    });
    if (!r.ok) throw new Error("save failed");
    const data = await r.json();
    setRates((prev) => {
      const filtered = prev.filter((x) => !(x.programType === rate.programType && x.periodMonths === rate.periodMonths));
      return [...filtered, data.rate].sort((a, b) => a.programType.localeCompare(b.programType) || a.periodMonths - b.periodMonths);
    });
  }

  async function deleteRate(id: string) {
    if (!confirm("¿Eliminar esta tarifa?")) return;
    await fetch(`/api/renewal-rates?id=${id}`, { method: "DELETE" });
    setRates((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-4">
      {PROGRAMS.map((p) => (
        <section key={p.key} className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded"
              style={{ background: PROGRAM_COLORS[p.key].bg, color: PROGRAM_COLORS[p.key].text }}
            >
              {p.label}
            </span>
            {canEdit && (
              <button
                onClick={() => setAdding(true)}
                className="text-xs font-medium px-2.5 py-1 rounded border border-neutral-300 hover:bg-neutral-50 flex items-center gap-1"
              >
                <Plus size={12} /> Añadir duración
              </button>
            )}
          </div>
          {grouped[p.key].length === 0 ? (
            <p className="text-xs text-neutral-400 italic py-2">
              Sin tarifas registradas todavía para {p.label}.
            </p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {grouped[p.key].map((rate) => (
                <RateRow key={rate.id} rate={rate} canEdit={canEdit} onSave={saveRate} onDelete={() => deleteRate(rate.id)} />
              ))}
            </div>
          )}
          {canEdit && adding && (
            <NewRateForm programType={p.key} onCancel={() => setAdding(false)} onSave={async (r) => {
              await saveRate(r);
              setAdding(false);
            }} />
          )}
        </section>
      ))}
    </div>
  );
}

function RateRow({ rate, canEdit, onSave, onDelete }: {
  rate: Rate;
  canEdit: boolean;
  onSave: (r: Omit<Rate, "id"> & { id?: string }) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(rate.amount));
  const [notes, setNotes] = useState(rate.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSave({
        id: rate.id,
        programType: rate.programType,
        periodMonths: rate.periodMonths,
        amount: Number(amount),
        currency: rate.currency,
        notes: notes.trim() || null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="py-2 flex items-center gap-2 text-sm">
        <span className="font-medium min-w-[80px]">{rate.periodMonths} meses</span>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-24 px-2 py-1 text-sm border border-neutral-300 rounded"
          placeholder="0"
        />
        <span className="text-xs text-neutral-500">{rate.currency}</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas (opcional)"
          className="flex-1 px-2 py-1 text-xs border border-neutral-300 rounded"
        />
        <button onClick={submit} disabled={saving} className="text-xs font-semibold px-2.5 py-1 rounded bg-neutral-900 text-white flex items-center gap-1 disabled:opacity-50">
          <Save size={11} /> Guardar
        </button>
        <button onClick={() => setEditing(false)} className="text-xs text-neutral-500 px-1.5">
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="py-2 flex items-center gap-3 text-sm">
      <span className="font-medium min-w-[80px]">{rate.periodMonths} meses</span>
      <span className="text-lg font-bold tabular-nums">
        {rate.amount.toFixed(2)} <span className="text-xs font-normal text-neutral-500">{rate.currency}</span>
      </span>
      {rate.notes && <span className="text-xs text-neutral-500 flex-1 truncate">{rate.notes}</span>}
      {canEdit && (
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setEditing(true)} className="text-xs text-neutral-600 hover:underline">
            Editar
          </button>
          <button onClick={onDelete} className="text-xs text-red-600 hover:underline flex items-center gap-0.5">
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

function NewRateForm({ programType, onCancel, onSave }: {
  programType: string;
  onCancel: () => void;
  onSave: (r: Omit<Rate, "id">) => Promise<void>;
}) {
  const [periodMonths, setPeriodMonths] = useState("4");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const valid = Number(periodMonths) >= 1 && Number(amount) >= 0;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try {
      await onSave({
        programType,
        periodMonths: Number(periodMonths),
        amount: Number(amount),
        currency: "EUR",
        notes: notes.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center gap-2 text-sm flex-wrap">
      <input
        type="number"
        value={periodMonths}
        onChange={(e) => setPeriodMonths(e.target.value)}
        placeholder="Meses"
        min={1}
        max={24}
        className="w-20 px-2 py-1 text-sm border border-neutral-300 rounded"
      />
      <span className="text-xs text-neutral-500">meses</span>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Precio"
        className="w-28 px-2 py-1 text-sm border border-neutral-300 rounded"
      />
      <span className="text-xs text-neutral-500">EUR</span>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notas (opcional)"
        className="flex-1 min-w-[120px] px-2 py-1 text-xs border border-neutral-300 rounded"
      />
      <button
        onClick={submit}
        disabled={!valid || saving}
        className="text-xs font-semibold px-2.5 py-1 rounded bg-neutral-900 text-white flex items-center gap-1 disabled:opacity-50"
      >
        <Save size={11} /> Añadir
      </button>
      <button onClick={onCancel} className="text-xs text-neutral-500 px-1.5">
        <X size={13} />
      </button>
    </div>
  );
}
