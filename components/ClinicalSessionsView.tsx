"use client";

import { useMemo, useState } from "react";

type Case = {
  id: string;
  patientName: string;
  assignedToId: string | null;
  status: string;
  bodyZone: string | null;
  situation: string | null;
  proposedSolutions: string | null;
  consensusSolution: string | null;
};

type TeamMember = { id: string; fullName: string };

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-red-100 text-red-700 border-red-200" },
  supervision: { label: "En supervisión", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  resuelto: { label: "Resuelto", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};

const STATUS_OPTIONS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "supervision", label: "En supervisión" },
  { value: "resuelto", label: "Resuelto" },
];

export function ClinicalSessionsView({
  currentUserId,
  team,
  initialCases,
}: {
  currentUserId: string;
  team: TeamMember[];
  initialCases: Case[];
}) {
  const [cases, setCases] = useState<Case[]>(initialCases);
  const [filter, setFilter] = useState<"todos" | "pendiente" | "supervision" | "resuelto" | "mios">("todos");
  const [editing, setEditing] = useState<Case | null>(null);
  const [creating, setCreating] = useState(false);

  const teamMap = useMemo(() => Object.fromEntries(team.map((t) => [t.id, t.fullName])), [team]);

  const filtered = cases.filter((c) => {
    if (filter === "todos") return true;
    if (filter === "mios") return c.assignedToId === currentUserId;
    return c.status === filter;
  });

  const counts = {
    todos: cases.length,
    pendiente: cases.filter((c) => c.status === "pendiente").length,
    supervision: cases.filter((c) => c.status === "supervision").length,
    resuelto: cases.filter((c) => c.status === "resuelto").length,
    mios: cases.filter((c) => c.assignedToId === currentUserId).length,
  };

  function upsertLocal(c: Case) {
    setCases((prev) => {
      const i = prev.findIndex((x) => x.id === c.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = c;
        return next;
      }
      return [c, ...prev];
    });
  }

  const TABS: { value: typeof filter; label: string }[] = [
    { value: "todos", label: "Todos" },
    { value: "pendiente", label: "Pendientes" },
    { value: "supervision", label: "En supervisión" },
    { value: "resuelto", label: "Resueltos" },
    { value: "mios", label: "Míos" },
  ];

  return (
    <div>
      <header className="flex justify-between items-start gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-xl font-semibold">Reuniones</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Sesiones clínicas · casos del equipo</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary text-sm">
          + Nuevo caso
        </button>
      </header>

      {/* Filtros por estado */}
      <div className="flex gap-1 mb-4 border-b border-neutral-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setFilter(t.value)}
            className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${
              filter === t.value ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {t.label} <span className="text-xs text-neutral-400">{counts[t.value]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-12">
          {cases.length === 0 ? "Aún no hay casos. Crea el primero." : "No hay casos en este filtro."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const meta = STATUS_META[c.status] ?? STATUS_META.pendiente;
            return (
              <button
                key={c.id}
                onClick={() => setEditing(c)}
                className="card w-full text-left hover:border-neutral-400 transition-colors block"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{c.patientName}</span>
                      {c.bodyZone && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">{c.bodyZone}</span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {c.assignedToId && teamMap[c.assignedToId] ? teamMap[c.assignedToId] : "Sin asignar"}
                    </div>
                    {c.situation && (
                      <p className="text-xs text-neutral-600 mt-1.5 line-clamp-2">{c.situation}</p>
                    )}
                  </div>
                  <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0 ${meta.cls}`}>
                    {meta.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <CaseEditorModal
          team={team}
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(c) => {
            upsertLocal(c);
            setCreating(false);
            setEditing(null);
          }}
          onDeleted={(id) => {
            setCases((prev) => prev.filter((x) => x.id !== id));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CaseEditorModal({
  team,
  initial,
  onClose,
  onSaved,
  onDeleted,
}: {
  team: TeamMember[];
  initial: Case | null;
  onClose: () => void;
  onSaved: (c: Case) => void;
  onDeleted: (id: string) => void;
}) {
  const [patientName, setPatientName] = useState(initial?.patientName ?? "");
  const [assignedToId, setAssignedToId] = useState(initial?.assignedToId ?? "");
  const [status, setStatus] = useState(initial?.status ?? "pendiente");
  const [bodyZone, setBodyZone] = useState(initial?.bodyZone ?? "");
  const [situation, setSituation] = useState(initial?.situation ?? "");
  const [proposedSolutions, setProposedSolutions] = useState(initial?.proposedSolutions ?? "");
  const [consensusSolution, setConsensusSolution] = useState(initial?.consensusSolution ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!patientName.trim()) {
      setError("El nombre del paciente es obligatorio.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      patientName: patientName.trim(),
      assignedToId: assignedToId || null,
      status,
      bodyZone,
      situation,
      proposedSolutions,
      consensusSolution,
    };
    const res = await fetch("/api/clinical-cases", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(initial ? { id: initial.id, ...payload } : payload),
    });
    if (res.ok) {
      const data = await res.json();
      onSaved(data);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "No se pudo guardar.");
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm("¿Eliminar este caso? No se puede deshacer.")) return;
    setSaving(true);
    const res = await fetch(`/api/clinical-cases?id=${initial.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(initial.id);
    else {
      setError("No se pudo eliminar.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">{initial ? "Editar caso" : "Nuevo caso"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre del paciente *</label>
            <input className="input text-sm" value={patientName} onChange={(e) => setPatientName(e.target.value)} autoFocus />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Fisioterapeuta</label>
              <select className="input text-sm" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
                <option value="">Sin asignar</option>
                {team.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Estado</label>
              <select className="input text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Zona corporal</label>
            <input className="input text-sm" value={bodyZone} onChange={(e) => setBodyZone(e.target.value)} placeholder="Ej: hombro, lumbar..." />
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Descripción de la situación</label>
            <textarea className="input text-sm" rows={3} value={situation} onChange={(e) => setSituation(e.target.value)} />
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Soluciones propuestas</label>
            <textarea className="input text-sm" rows={3} value={proposedSolutions} onChange={(e) => setProposedSolutions(e.target.value)} />
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Solución consensuada</label>
            <textarea className="input text-sm" rows={3} value={consensusSolution} onChange={(e) => setConsensusSolution(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-between items-center gap-2 pt-2 border-t border-neutral-100">
            <div>
              {initial && (
                <button onClick={remove} disabled={saving} className="text-sm text-red-600 hover:underline">
                  Eliminar
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
              <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
