"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";

type PR = {
  id: string;
  name: string;
  value: string;
  unit: string | null;
  notes: string | null;
  recordedAt: string;
};

const SUGGESTIONS = ["Snatch", "Clean & Jerk", "Back Squat", "Front Squat", "Deadlift", "Strict Press", "Fran", "Helen", "Grace", "Murph", "Cindy"];

export function PatientPRsClient({ initial }: { initial: PR[] }) {
  const router = useRouter();
  const [list, setList] = useState<PR[]>(initial);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("kg");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !value.trim()) return;
    setSaving(true);
    const res = await fetch("/api/patient/prs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), value: value.trim(), unit: unit.trim() || null, notes: notes.trim() || null }),
    });
    if (res.ok) {
      const created = await res.json();
      setList((a) => [{ ...created, recordedAt: created.recordedAt }, ...a]);
      setName(""); setValue(""); setUnit("kg"); setNotes("");
      setAdding(false);
      router.refresh();
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("¿Borrar este PR?")) return;
    await fetch(`/api/patient/prs?id=${id}`, { method: "DELETE" });
    setList((a) => a.filter((p) => p.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full rounded-2xl py-3 text-sm font-semibold flex items-center justify-center gap-2"
          style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}
        >
          <Plus size={16} /> Añadir PR
        </button>
      ) : (
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
        >
          <div>
            <label className="text-[11px] block mb-1" style={{ color: "var(--p-text-dim)" }}>Ejercicio *</label>
            <input
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: "var(--p-card-bg)", color: "var(--p-card-ink)", border: "1px solid var(--p-border)" }}
              placeholder="Ej. Snatch"
              value={name}
              onChange={(e) => setName(e.target.value)}
              list="pr-suggestions"
              autoFocus
            />
            <datalist id="pr-suggestions">
              {SUGGESTIONS.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] block mb-1" style={{ color: "var(--p-text-dim)" }}>Marca *</label>
              <input
                className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                style={{ background: "var(--p-card-bg)", color: "var(--p-card-ink)", border: "1px solid var(--p-border)" }}
                placeholder="100 / 3:21 / 12 rounds"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] block mb-1" style={{ color: "var(--p-text-dim)" }}>Unidad</label>
              <input
                className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                style={{ background: "var(--p-card-bg)", color: "var(--p-card-ink)", border: "1px solid var(--p-border)" }}
                placeholder="kg / tiempo / reps"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] block mb-1" style={{ color: "var(--p-text-dim)" }}>Notas (opcional)</label>
            <input
              className="w-full px-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: "var(--p-card-bg)", color: "var(--p-card-ink)", border: "1px solid var(--p-border)" }}
              placeholder="Sensaciones, condiciones..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { setAdding(false); setName(""); setValue(""); }} className="text-xs px-3 py-2" style={{ color: "var(--p-text-dim)" }}>
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving || !name.trim() || !value.trim()}
              className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
              style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}
            >
              {saving ? "Guardando..." : "Guardar PR"}
            </button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-center py-12 italic" style={{ color: "var(--p-text-faint)" }}>
          Aún no has registrado ningún PR. ¡Empieza por tu Snatch o tu Fran!
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((pr) => (
            <article
              key={pr.id}
              className="rounded-2xl p-3 flex items-center justify-between"
              style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
            >
              <div className="min-w-0">
                <div className="font-semibold text-sm">{pr.name}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold tabular-nums" style={{ color: "var(--p-accent)" }}>{pr.value}</span>
                  {pr.unit && <span className="text-xs" style={{ color: "var(--p-text-dim)" }}>{pr.unit}</span>}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--p-text-faint)" }}>
                  {new Date(pr.recordedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                  {pr.notes && ` · ${pr.notes}`}
                </div>
              </div>
              <button onClick={() => remove(pr.id)} className="p-2 rounded-lg flex-shrink-0" style={{ color: "var(--p-text-faint)" }}>
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
