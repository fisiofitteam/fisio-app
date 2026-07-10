"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ResultUI = {
  id: string;
  value: string;
  unit: string | null;
  recordedAt: string;
  notes: string | null;
  patient: { id: string; fullName: string; photoUrl: string | null; programType: string | null };
};
type Challenge = {
  id: string;
  year: number;
  month: number;
  title: string;
  description: string | null;
  metric: "score" | "time";
  results: ResultUI[];
};

const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function parseTimeToSeconds(s: string): number | null {
  // "3:42" → 222, "3:42.5" → 222.5, "127" → 127 si solo number
  const m = s.trim().match(/^(?:(\d+):)?(\d+)(?:[.,](\d+))?$/);
  if (!m) return null;
  const mins = m[1] ? parseInt(m[1], 10) : 0;
  const secs = parseInt(m[2], 10);
  const dec = m[3] ? parseFloat("0." + m[3]) : 0;
  return mins * 60 + secs + dec;
}
function parseScore(s: string): number | null {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}
function sortResults(results: ResultUI[], metric: "score" | "time"): ResultUI[] {
  return [...results].sort((a, b) => {
    const va = metric === "time" ? parseTimeToSeconds(a.value) : parseScore(a.value);
    const vb = metric === "time" ? parseTimeToSeconds(b.value) : parseScore(b.value);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return metric === "time" ? va - vb : vb - va;
  });
}

export function ChallengeManager({
  initial, currentYear, currentMonth,
}: {
  initial: Challenge[];
  currentYear: number;
  currentMonth: number;
}) {
  const router = useRouter();
  const [list, setList] = useState<Challenge[]>(initial);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [editing, setEditing] = useState<Challenge | null>(null);

  const visible = useMemo(() => list.find((c) => c.year === year && c.month === month) ?? null, [list, year, month]);

  function months12() {
    const out: { year: number; month: number; label: string }[] = [];
    const d = new Date(currentYear, currentMonth, 1);
    for (let i = 0; i < 12; i++) {
      const y = d.getFullYear(), m = d.getMonth();
      out.push({ year: y, month: m, label: `${MONTH_NAMES[m]} ${y}` });
      d.setMonth(d.getMonth() - 1);
    }
    return out;
  }

  async function save(data: { year: number; month: number; title: string; description: string; metric: "score" | "time" }) {
    const res = await fetch("/api/monthly-challenges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const saved = await res.json();
      setList((a) => {
        const idx = a.findIndex((c) => c.year === saved.year && c.month === saved.month);
        const newC: Challenge = {
          id: saved.id, year: saved.year, month: saved.month,
          title: saved.title, description: saved.description, metric: saved.metric as "score" | "time",
          results: idx >= 0 ? a[idx].results : [],
        };
        if (idx >= 0) { const copy = [...a]; copy[idx] = newC; return copy; }
        return [newC, ...a];
      });
      setEditing(null);
      router.refresh();
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Borrar el reto del mes y todos los resultados asociados?")) return;
    await fetch(`/api/monthly-challenges?id=${id}`, { method: "DELETE" });
    setList((a) => a.filter((c) => c.id !== id));
    router.refresh();
  }

  async function removeResult(challengeId: string, resultId: string, patientName: string) {
    if (!confirm(`¿Borrar el resultado de ${patientName}?`)) return;
    const res = await fetch(`/api/monthly-challenges/results/${resultId}`, { method: "DELETE" });
    if (!res.ok) {
      alert("No se pudo borrar el resultado");
      return;
    }
    setList((a) => a.map((c) => c.id === challengeId ? { ...c, results: c.results.filter((r) => r.id !== resultId) } : c));
    router.refresh();
  }

  return (
    <main>
      <header className="mb-4 flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">🎯 Retos mensuales</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Un reto por mes para los ADVANCE rolling. Cada paciente envía su resultado y se construye un leaderboard.</p>
        </div>
      </header>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <label className="text-xs text-neutral-500">Mes</label>
        <select
          className="input text-sm w-auto"
          value={`${year}-${month}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-").map(Number);
            setYear(y); setMonth(m);
          }}
        >
          {months12().map((m) => <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{m.label}</option>)}
        </select>
        {!visible && !editing && (
          <button onClick={() => setEditing({ id: "", year, month, title: "", description: "", metric: "score", results: [] })} className="btn btn-primary text-sm ml-auto">
            + Crear reto para {MONTH_NAMES[month]}
          </button>
        )}
      </div>

      {editing ? (
        <ChallengeForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(d) => save(d)}
        />
      ) : visible ? (
        <ChallengeView
          challenge={visible}
          onEdit={() => setEditing(visible)}
          onDelete={() => remove(visible.id)}
          onDeleteResult={(rid, name) => removeResult(visible.id, rid, name)}
        />
      ) : (
        <p className="text-sm text-neutral-400 italic py-12 text-center card">
          Aún no hay reto configurado para {MONTH_NAMES[month]} {year}.
        </p>
      )}
    </main>
  );
}

function ChallengeForm({
  initial, onCancel, onSave,
}: {
  initial: Challenge;
  onCancel: () => void;
  onSave: (d: { year: number; month: number; title: string; description: string; metric: "score" | "time" }) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [metric, setMetric] = useState<"score" | "time">(initial.metric);

  return (
    <div className="card space-y-3">
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Título</label>
        <input className="input text-sm font-medium" placeholder='Ej. "Fran sub-4"' value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Descripción / reglas (opcional)</label>
        <textarea className="input text-sm" rows={3} placeholder="Reglas del reto, condiciones, ventana de fechas..." value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Tipo de medición</label>
        <select className="input text-sm" value={metric} onChange={(e) => setMetric(e.target.value as any)}>
          <option value="score">Score / peso / reps (mayor = mejor)</option>
          <option value="time">Tiempo MM:SS (menor = mejor)</option>
        </select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="btn btn-ghost text-sm">Cancelar</button>
        <button onClick={() => title.trim() && onSave({ year: initial.year, month: initial.month, title: title.trim(), description: description.trim(), metric })} disabled={!title.trim()} className="btn btn-primary text-sm">
          Guardar
        </button>
      </div>
    </div>
  );
}

function ChallengeView({
  challenge, onEdit, onDelete, onDeleteResult,
}: {
  challenge: Challenge;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteResult: (resultId: string, patientName: string) => void;
}) {
  const sorted = sortResults(challenge.results, challenge.metric);
  return (
    <div>
      <section className="card mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base">{challenge.title}</h2>
            {challenge.description && <p className="text-sm text-neutral-600 mt-1 whitespace-pre-line">{challenge.description}</p>}
            <p className="text-[11px] text-neutral-400 mt-2">
              Medición: {challenge.metric === "time" ? "tiempo (menor mejor)" : "score (mayor mejor)"}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onEdit} className="text-xs text-neutral-600 hover:text-neutral-900 px-2 py-1">✏️ Editar</button>
            <button onClick={onDelete} className="text-xs text-red-600 px-2 py-1">🗑️ Borrar</button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="flex justify-between items-end mb-3">
          <h3 className="font-medium text-sm">🏆 Leaderboard</h3>
          <span className="text-xs text-neutral-500">{sorted.length} {sorted.length === 1 ? "participante" : "participantes"}</span>
        </div>
        {sorted.length === 0 ? (
          <p className="text-sm text-neutral-400 italic text-center py-6">Aún no hay resultados enviados.</p>
        ) : (
          <ol className="space-y-2">
            {sorted.map((r, i) => (
              <li key={r.id} className="flex items-center gap-3 p-2 rounded-lg" style={{ background: i === 0 ? "#FEF3C7" : i === 1 ? "#F5F5F5" : i === 2 ? "#FFEDD5" : "transparent", border: i < 3 ? "1px solid #E5E5E5" : "none" }}>
                <span className="font-bold w-7 text-center tabular-nums" style={{ color: i === 0 ? "#92400E" : i === 1 ? "#525252" : i === 2 ? "#9A3412" : "#737373", fontSize: i < 3 ? 18 : 14 }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                </span>
                {r.patient.photoUrl ? (
                  <img src={r.patient.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0" style={{ background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)", color: "#0A0A0A" }}>
                    {r.patient.fullName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{r.patient.fullName}</div>
                  {r.notes && <div className="text-[11px] text-neutral-500 truncate">{r.notes}</div>}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold tabular-nums">{r.value}{r.unit && <span className="text-xs font-normal text-neutral-500 ml-1">{r.unit}</span>}</div>
                  <div className="text-[10px] text-neutral-400">{new Date(r.recordedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</div>
                </div>
                <button
                  onClick={() => onDeleteResult(r.id, r.patient.fullName)}
                  title={`Borrar resultado de ${r.patient.fullName}`}
                  className="text-neutral-300 hover:text-red-600 p-1 flex-shrink-0"
                >
                  🗑
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
