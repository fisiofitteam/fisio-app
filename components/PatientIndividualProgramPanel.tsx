"use client";

/**
 * Panel en la ficha del paciente ADVANCE para asignar programas individuales
 * ("Trabajo específico") además del rolling. Reutiliza el ProgramAssignment
 * existente. Al asignar uno, aparece en el home del atleta como header
 * morado cuando toca la sesión del día.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, Search } from "lucide-react";

type ProgramOption = {
  id: string;
  name: string;
  type: string;
  level: number;
  weeksCount: number;
  bodyZone: string;
};

type Assignment = {
  id: string;
  programId: string;
  startDate: string;
  weeksCount: number;
  isActive: boolean;
  program: { id: string; name: string; type: string; level: number };
};

export function PatientIndividualProgramPanel({
  patientId,
  patientName,
}: {
  patientId: string;
  patientName: string;
}) {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    const res = await fetch(`/api/patient-assignments?patientId=${patientId}`).then((r) => r.json()).catch(() => null);
    if (res?.ok) setAssignments(res.assignments);
  }
  useEffect(() => { reload(); }, [patientId]);

  async function toggleActive(a: Assignment) {
    setBusy(a.id);
    await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, isActive: !a.isActive }),
    });
    await reload();
    router.refresh();
    setBusy(null);
  }

  async function remove(a: Assignment) {
    if (!confirm(`Quitar el programa "${a.program.name}" de ${patientName}? Se perderán las sesiones no completadas.`)) return;
    setBusy(a.id);
    await fetch(`/api/assignments?id=${a.id}`, { method: "DELETE" });
    await reload();
    router.refresh();
    setBusy(null);
  }

  const active = (assignments ?? []).filter((a) => a.isActive);
  const inactive = (assignments ?? []).filter((a) => !a.isActive);

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-medium">Trabajo específico (programas individuales)</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Además del rolling, este atleta puede tener programas propios (movilidad, adaptación clínica, tendinoso…) que verá en su home como bloque morado.
          </p>
        </div>
        <button
          onClick={() => setShowAssign(true)}
          className="btn btn-primary text-xs flex items-center gap-1.5"
        >
          <Plus size={14} /> Añadir programa
        </button>
      </div>

      {assignments === null ? (
        <p className="text-xs text-neutral-500 italic">Cargando…</p>
      ) : assignments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 py-6 text-center text-xs text-neutral-500 italic">
          Sin programas individuales asignados. Puedes añadir uno para dar trabajo específico.
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((a) => (
            <AssignmentRow key={a.id} a={a} busy={busy === a.id} onToggle={() => toggleActive(a)} onRemove={() => remove(a)} />
          ))}
          {inactive.length > 0 && (
            <div className="pt-2 mt-2 border-t border-neutral-100">
              <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">Inactivos (histórico)</div>
              {inactive.map((a) => (
                <AssignmentRow key={a.id} a={a} busy={busy === a.id} onToggle={() => toggleActive(a)} onRemove={() => remove(a)} />
              ))}
            </div>
          )}
        </div>
      )}

      {showAssign && (
        <AssignModal
          patientId={patientId}
          onClose={() => setShowAssign(false)}
          onAssigned={async () => {
            setShowAssign(false);
            await reload();
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function AssignmentRow({
  a, busy, onToggle, onRemove,
}: {
  a: Assignment;
  busy: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const start = new Date(a.startDate);
  const end = new Date(start);
  end.setDate(start.getDate() + a.weeksCount * 7 - 1);
  return (
    <div className={`rounded-lg border p-2.5 flex items-center gap-3 ${a.isActive ? "border-neutral-200 bg-white" : "border-neutral-100 bg-neutral-50 opacity-60"}`}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{a.program.name}</div>
        <div className="text-[11px] text-neutral-500 mt-0.5">
          {a.program.type} · N{a.program.level} · {a.weeksCount} sem ·{" "}
          {start.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
          {" → "}
          {end.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onToggle}
          disabled={busy}
          className="text-[11px] font-medium px-2 py-1 rounded border border-neutral-300 hover:bg-neutral-100 disabled:opacity-50"
        >
          {a.isActive ? "Desactivar" : "Reactivar"}
        </button>
        <button
          onClick={onRemove}
          disabled={busy}
          className="p-1.5 rounded hover:bg-red-50 text-neutral-400 hover:text-red-600 disabled:opacity-50"
          title="Borrar"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function AssignModal({
  patientId, onClose, onAssigned,
}: {
  patientId: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [programs, setPrograms] = useState<ProgramOption[] | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProgramOption | null>(null);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    // Formato YYYY-MM-DD para el input date
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/programs/list")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPrograms(data);
        else setPrograms([]);
      })
      .catch(() => setPrograms([]));
  }, []);

  const filtered = (programs ?? []).filter((p) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return p.name.toLowerCase().includes(s) || p.type.toLowerCase().includes(s) || p.bodyZone?.toLowerCase().includes(s);
  });

  async function assign() {
    if (!selected) return;
    setSaving(true);
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, programId: selected.id, startDate, weeksCount: selected.weeksCount }),
    });
    onAssigned();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-medium">Añadir trabajo específico</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Elige un programa de la biblioteca y la fecha de inicio.</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 p-1"><X size={18} /></button>
        </div>

        {selected ? (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 mb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-sm">{selected.name}</div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {selected.type} · N{selected.level} · {selected.weeksCount} sem
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-xs text-neutral-500 hover:text-neutral-900 underline flex-shrink-0">
                Cambiar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-2 top-2.5 text-neutral-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, tipo o zona…"
                className="w-full text-sm pl-7 pr-3 py-2 border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
              />
            </div>
            <div className="flex-1 overflow-y-auto border border-neutral-200 rounded-lg mb-3">
              {programs === null ? (
                <p className="text-xs text-neutral-500 italic p-3">Cargando programas…</p>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-neutral-500 italic p-3">Sin programas que coincidan.</p>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="w-full text-left px-3 py-2 hover:bg-neutral-50 border-b border-neutral-100 last:border-b-0"
                  >
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      {p.type} · N{p.level} · {p.weeksCount} sem · {p.bodyZone}
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        <label className="block mb-3">
          <span className="text-xs text-neutral-600 block mb-1">Fecha de inicio</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input text-sm w-full"
          />
        </label>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 btn btn-ghost text-sm">Cancelar</button>
          <button
            onClick={assign}
            disabled={!selected || saving}
            className="flex-1 btn btn-primary text-sm disabled:opacity-50"
          >
            {saving ? "Asignando…" : "Asignar programa"}
          </button>
        </div>
      </div>
    </div>
  );
}
