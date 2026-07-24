"use client";

import { useMemo, useState } from "react";
import { ProgressRing } from "@/components/ProgressRing";
import { PatientPill } from "@/components/PatientPills";

type Case = {
  id: string;
  patientId: string;
  patientName: string;
  assignedToId: string | null;
  bodyZone: string | null;
  programType: string | null;
  appliedLevelName: string | null;
  hasSubscription: boolean;
  subConsumed: number;
  subTotal: number;
  currentWeek?: number | null;
  isPausedNow?: boolean;
  adhCompleted: number;
  adhTotal: number;
  status: string;
  situation: string | null;
  proposedSolutions: string | null;
  consensusSolution: string | null;
};

type PatientOption = { id: string; fullName: string; assignedToId: string | null; bodyZone: string | null };
type Professional = { id: string; fullName: string };

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
  isCeo,
  professionals,
  patients,
  initialCases,
}: {
  currentUserId: string;
  isCeo: boolean;
  professionals: Professional[];
  patients: PatientOption[];
  initialCases: Case[];
}) {
  const [cases, setCases] = useState<Case[]>(initialCases);
  const [filter, setFilter] = useState<"todos" | "pendiente" | "supervision" | "resuelto" | "mios">("pendiente");
  const [editing, setEditing] = useState<Case | null>(null);
  const [creating, setCreating] = useState(false);

  const proMap = useMemo(() => Object.fromEntries(professionals.map((p) => [p.id, p.fullName])), [professionals]);

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

  const TABS = [
    { value: "pendiente", label: "Pendientes" },
    { value: "supervision", label: "En supervisión" },
    { value: "resuelto", label: "Resueltos" },
    ...(isCeo ? [] : [{ value: "mios", label: "Míos" }]),
  ] as { value: typeof filter; label: string }[];

  // Pacientes que aún no tienen caso, para el selector de "Nuevo caso"
  const existingPatientIds = new Set(cases.map((c) => c.patientId));
  const availablePatients = patients.filter((p) => !existingPatientIds.has(p.id));

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
          {cases.length === 0 ? "Aún no hay casos. Añade el primero." : "No hay casos en este filtro."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const meta = STATUS_META[c.status] ?? STATUS_META.pendiente;
            return (
              <button key={c.id} onClick={() => setEditing(c)} className="card w-full text-left hover:border-neutral-400 transition-colors block">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Círculos a la izquierda (en horizontal) */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {c.hasSubscription && (
                        <div className="flex flex-col items-center gap-0.5">
                          <ProgressRing value={c.subConsumed} max={c.subTotal} size={40} stroke={4} label="suscripción" mode="subscription" />
                          {c.currentWeek != null && (
                            <span
                              className="text-[9px] font-semibold"
                              style={{ color: c.isPausedNow ? "#B45309" : "#525252" }}
                              title={c.isPausedNow ? "Congelado por pausa" : "Semana actual"}
                            >
                              Sem {c.currentWeek}{c.isPausedNow && " ⏸"}
                            </span>
                          )}
                        </div>
                      )}
                      <ProgressRing value={c.adhCompleted} max={c.adhTotal} size={40} stroke={4} label="cumplimiento" mode="adherence" />
                    </div>
                    {/* Barra divisoria */}
                    <div className="w-px self-stretch bg-neutral-200 flex-shrink-0" />
                    {/* Info del paciente */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{c.patientName}</span>
                        <PatientPill value={c.programType} kind="program" />
                        {c.bodyZone && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">{c.bodyZone}</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-xs mt-0.5">
                        <span className="text-neutral-500">
                          {c.assignedToId && proMap[c.assignedToId] ? proMap[c.assignedToId] : "Sin fisio asignado"}
                        </span>
                        {c.appliedLevelName && (
                          <span className="text-emerald-700">✓ Control de cargas · {c.appliedLevelName}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Estado a la derecha */}
                  <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0 ${meta.cls}`}>
                    {meta.label}
                  </span>
                </div>

                {/* Columnas tipo Notion: visibles sin entrar en la ficha */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-neutral-100">
                  <CaseColumn label="Situación" text={c.situation} />
                  <CaseColumn label="Soluciones propuestas" text={c.proposedSolutions} />
                  <CaseColumn label="Solución consensuada" text={c.consensusSolution} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {creating && (
        <NewCaseModal
          availablePatients={availablePatients}
          proMap={proMap}
          onClose={() => setCreating(false)}
          onSaved={(c) => {
            upsertLocal(c);
            setCreating(false);
          }}
          onConflict={(id) => {
            const existing = cases.find((x) => x.id === id);
            setCreating(false);
            if (existing) setEditing(existing);
          }}
        />
      )}

      {editing && (
        <EditCaseModal
          c={editing}
          proMap={proMap}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            upsertLocal(c);
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

// Columna de la tarjeta (estilo Notion): etiqueta + texto recortado.
function CaseColumn({ label, text }: { label: string; text: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium mb-0.5">{label}</div>
      {text?.trim() ? (
        <p className="text-xs text-neutral-700 whitespace-pre-wrap line-clamp-4">{text}</p>
      ) : (
        <p className="text-xs text-neutral-300 italic">—</p>
      )}
    </div>
  );
}

// ── Campos de contenido reutilizados por crear/editar ──
function ContentFields({
  status,
  setStatus,
  situation,
  setSituation,
  proposed,
  setProposed,
  consensus,
  setConsensus,
}: {
  status: string;
  setStatus: (v: string) => void;
  situation: string;
  setSituation: (v: string) => void;
  proposed: string;
  setProposed: (v: string) => void;
  consensus: string;
  setConsensus: (v: string) => void;
}) {
  return (
    <>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Estado</label>
        <select className="input text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Descripción de la situación</label>
        <textarea className="input text-sm" rows={3} value={situation} onChange={(e) => setSituation(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Soluciones propuestas</label>
        <textarea className="input text-sm" rows={3} value={proposed} onChange={(e) => setProposed(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Solución consensuada</label>
        <textarea className="input text-sm" rows={3} value={consensus} onChange={(e) => setConsensus(e.target.value)} />
      </div>
    </>
  );
}

function DerivedInfo({ fisio, zone }: { fisio: string; zone: string | null }) {
  return (
    <div className="bg-neutral-50 rounded-lg p-3 text-sm grid grid-cols-2 gap-2">
      <div>
        <div className="text-[10px] uppercase text-neutral-500">Fisioterapeuta</div>
        <div className="font-medium">{fisio}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-neutral-500">Zona corporal</div>
        <div className="font-medium">{zone || "—"}</div>
      </div>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NewCaseModal({
  availablePatients,
  proMap,
  onClose,
  onSaved,
  onConflict,
}: {
  availablePatients: PatientOption[];
  proMap: Record<string, string>;
  onClose: () => void;
  onSaved: (c: Case) => void;
  onConflict: (existingId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PatientOption | null>(null);
  const [status, setStatus] = useState("pendiente");
  const [situation, setSituation] = useState("");
  const [proposed, setProposed] = useState("");
  const [consensus, setConsensus] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const matches = query.trim()
    ? availablePatients.filter((p) => p.fullName.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/clinical-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: selected.id, status, situation, proposedSolutions: proposed, consensusSolution: consensus }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      onSaved(data);
    } else if (res.status === 409 && data.existingId) {
      onConflict(data.existingId);
    } else {
      setError(data.error || "No se pudo crear el caso.");
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Nuevo caso clínico" onClose={onClose}>
      <div className="space-y-3">
        {!selected ? (
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Buscar paciente</label>
            <input className="input text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Escribe un nombre..." autoFocus />
            {matches.length > 0 && (
              <div className="mt-2 border border-neutral-200 rounded-lg divide-y divide-neutral-100 max-h-60 overflow-y-auto">
                {matches.map((p) => (
                  <button key={p.id} onClick={() => setSelected(p)} className="w-full text-left px-3 py-2 hover:bg-neutral-50 text-sm">
                    <div className="font-medium">{p.fullName}</div>
                    <div className="text-xs text-neutral-500">
                      {p.assignedToId && proMap[p.assignedToId] ? proMap[p.assignedToId] : "Sin fisio"}{p.bodyZone ? ` · ${p.bodyZone}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {query.trim() && matches.length === 0 && (
              <p className="text-xs text-neutral-400 mt-2">Ningún paciente sin caso coincide con "{query}".</p>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{selected.fullName}</div>
              <button onClick={() => setSelected(null)} className="text-xs text-blue-600 hover:underline">Cambiar</button>
            </div>
            <DerivedInfo fisio={selected.assignedToId && proMap[selected.assignedToId] ? proMap[selected.assignedToId] : "Sin fisio asignado"} zone={selected.bodyZone} />
            <ContentFields status={status} setStatus={setStatus} situation={situation} setSituation={setSituation} proposed={proposed} setProposed={setProposed} consensus={consensus} setConsensus={setConsensus} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
              <button onClick={save} disabled={saving} className="btn btn-primary text-sm">{saving ? "Guardando..." : "Crear caso"}</button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function EditCaseModal({
  c,
  proMap,
  onClose,
  onSaved,
  onDeleted,
}: {
  c: Case;
  proMap: Record<string, string>;
  onClose: () => void;
  onSaved: (c: Case) => void;
  onDeleted: (id: string) => void;
}) {
  const [status, setStatus] = useState(c.status);
  const [situation, setSituation] = useState(c.situation ?? "");
  const [proposed, setProposed] = useState(c.proposedSolutions ?? "");
  const [consensus, setConsensus] = useState(c.consensusSolution ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/clinical-cases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, status, situation, proposedSolutions: proposed, consensusSolution: consensus }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) onSaved(data);
    else {
      setError(data.error || "No se pudo guardar.");
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("¿Eliminar este caso? Desaparecerá también de la ficha del paciente.")) return;
    setSaving(true);
    const res = await fetch(`/api/clinical-cases?id=${c.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(c.id);
    else {
      setError("No se pudo eliminar.");
      setSaving(false);
    }
  }

  return (
    <ModalShell title={c.patientName} onClose={onClose}>
      <div className="space-y-3">
        <DerivedInfo fisio={c.assignedToId && proMap[c.assignedToId] ? proMap[c.assignedToId] : "Sin fisio asignado"} zone={c.bodyZone} />
        <ContentFields status={status} setStatus={setStatus} situation={situation} setSituation={setSituation} proposed={proposed} setProposed={setProposed} consensus={consensus} setConsensus={setConsensus} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-between items-center gap-2 pt-2 border-t border-neutral-100">
          <button onClick={remove} disabled={saving} className="text-sm text-red-600 hover:underline">Eliminar</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn btn-primary text-sm">{saving ? "Guardando..." : "Guardar"}</button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
