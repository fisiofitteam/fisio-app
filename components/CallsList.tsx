"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AgendarLlamadaButton } from "@/components/AgendarLlamadaButton";

type Call = {
  id: string;
  patientId: string;
  patientName: string;
  patientFirstName: string;
  patientGroupUrl: string | null;
  scheduledAt: string | null;
  type: string;
  notes: string;
  completedAt: string | null;
  outcome: string;
};

const TYPE_LABELS: Record<string, string> = {
  optimizacion: "Optimización",
  renovacion: "Renovación",
};

export function CallsList({
  calls,
  patients,
}: {
  calls: Call[];
  patients: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Call | null>(null);
  const [completeFor, setCompleteFor] = useState<Call | null>(null);

  // Pendientes: primero los que aún no tienen fecha (aviso reciente sin
  // agendar), luego los agendados por scheduledAt ascendente.
  const upcoming = calls
    .filter((c) => !c.completedAt)
    .sort((a, b) => {
      if (!a.scheduledAt && !b.scheduledAt) return 0;
      if (!a.scheduledAt) return -1;
      if (!b.scheduledAt) return 1;
      return a.scheduledAt.localeCompare(b.scheduledAt);
    });
  const done = calls.filter((c) => c.completedAt).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta llamada?")) return;
    await fetch(`/api/calls?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-neutral-500">
          {upcoming.length} próxima{upcoming.length !== 1 && "s"}
          {done.length > 0 && ` · ${done.length} realizada${done.length !== 1 ? "s" : ""}`}
        </p>
        <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs">+ Programar llamada</button>
      </div>

      {upcoming.length === 0 && done.length === 0 && (
        <p className="text-sm text-neutral-500 text-center py-12">No hay llamadas. Programa la primera.</p>
      )}

      {upcoming.length > 0 && (
        <section className="mb-4">
          <h2 className="text-xs uppercase text-neutral-500 font-medium mb-2">Próximas</h2>
          <div className="space-y-2">
            {upcoming.map((c) => (
              <CallRow
                key={c.id}
                call={c}
                onClick={() => setEditing(c)}
                onMarkDone={() => setCompleteFor(c)}
                onDelete={() => remove(c.id)}
              />
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="text-xs uppercase text-neutral-500 font-medium mb-2">Realizadas</h2>
          <div className="space-y-2 opacity-70">
            {done.map((c) => (
              <CallRow key={c.id} call={c} onClick={() => setEditing(c)} onMarkDone={() => {}} onDelete={() => remove(c.id)} />
            ))}
          </div>
        </section>
      )}

      {(showNew || editing) && (
        <CallModal
          call={editing}
          patients={patients}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => { setShowNew(false); setEditing(null); router.refresh(); }}
        />
      )}
      {completeFor && <CompleteCallModal call={completeFor} onClose={() => setCompleteFor(null)} onSaved={() => { setCompleteFor(null); router.refresh(); }} />}
    </div>
  );
}

function CallRow({ call, onClick, onMarkDone, onDelete }: { call: Call; onClick: () => void; onMarkDone: () => void; onDelete: () => void }) {
  // Pendiente de agendar cuando el aviso llegó pero el fisio aún no ha
  // fijado fecha con el paciente.
  const noSchedule = !call.scheduledAt;
  const date = call.scheduledAt ? new Date(call.scheduledAt) : null;
  const days = date ? Math.round((date.getTime() - Date.now()) / 86400000) : 0;
  const time = date ? date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "";
  const dateLabel = noSchedule
    ? "Pendiente de agendar"
    : days === 0 ? `Hoy ${time}`
    : days === 1 ? `Mañana ${time}`
    : days < 7 && days > 0 ? `${date!.toLocaleDateString("es-ES", { weekday: "long" })} ${time}`
    : date!.toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="card !p-3 cursor-pointer hover:border-neutral-300" onClick={onClick}>
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{call.patientName}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              call.type === "renovacion" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
            }`}>
              {TYPE_LABELS[call.type] ?? call.type}
            </span>
          </div>
          <div className={`text-xs mt-0.5 ${
            noSchedule && !call.completedAt ? "text-amber-700 font-medium"
            : days < 0 && !call.completedAt ? "text-red-600"
            : days <= 1 && !call.completedAt ? "text-amber-700"
            : "text-neutral-500"
          }`}>
            {call.completedAt ? `Realizada el ${new Date(call.completedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}` : dateLabel}
          </div>
          {call.notes && <div className="text-xs text-neutral-600 mt-1 italic">{call.notes}</div>}
          {call.outcome && <div className="text-xs text-emerald-700 mt-1">→ {call.outcome}</div>}
        </div>
        <div className="flex gap-2 flex-shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
          {!call.completedAt && (
            <AgendarLlamadaButton
              patientId={call.patientId}
              patientGroupUrl={call.patientGroupUrl}
              patientFirstName={call.patientFirstName}
            />
          )}
          {!call.completedAt && (
            <button onClick={onMarkDone} className="text-xs text-emerald-700">✓ Hecha</button>
          )}
          <button onClick={onDelete} className="text-xs text-red-600">✕</button>
        </div>
      </div>
    </div>
  );
}

function CallModal({
  call,
  patients,
  onClose,
  onSaved,
}: {
  call: Call | null;
  patients: { id: string; fullName: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!call;
  // Si la llamada aún no tiene fecha (aviso automático), el fisio la
  // rellena aquí. Dejamos ambos inputs vacíos por defecto para no
  // sugerir una fecha inventada.
  const initialDate = call?.scheduledAt ? call.scheduledAt.split("T")[0] : "";
  const initialTime = call?.scheduledAt ? new Date(call.scheduledAt).toTimeString().slice(0, 5) : "";

  const [patientId, setPatientId] = useState(call?.patientId ?? "");
  const [scheduledDate, setScheduledDate] = useState(initialDate);
  const [scheduledTime, setScheduledTime] = useState(initialTime);
  const [type, setType] = useState(call?.type ?? "optimizacion");
  const [notes, setNotes] = useState(call?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!patientId) return;
    setSaving(true);
    // Si fecha y hora están vacías, guardamos scheduledAt como null
    // ("pendiente de agendar"). Si hay fecha pero no hora, ponemos 10:00
    // por defecto para no romper el input.
    const scheduledAt = scheduledDate
      ? `${scheduledDate}T${scheduledTime || "10:00"}:00`
      : null;
    const payload = {
      ...(isEdit && { id: call!.id }),
      patientId,
      scheduledAt,
      type,
      notes,
    };
    await fetch("/api/calls", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">{isEdit ? "Editar llamada" : "Programar llamada"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Paciente</label>
            <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">— Elige paciente —</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-neutral-500">Fecha y hora (opcional)</label>
              {(scheduledDate || scheduledTime) && (
                <button
                  type="button"
                  onClick={() => { setScheduledDate(""); setScheduledTime(""); }}
                  className="text-[10px] text-neutral-500 underline"
                >
                  Dejar pendiente de agendar
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="input" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
              <input type="time" className="input" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Tipo</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="optimizacion">Optimización</option>
              <option value="renovacion">Renovación</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Notas (opcional)</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Qué quieres tratar en la llamada" />
          </div>
          <button onClick={save} disabled={!patientId || saving} className="btn btn-primary w-full">
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Programar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompleteCallModal({ call, onClose, onSaved }: { call: Call; onClose: () => void; onSaved: () => void }) {
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch("/api/calls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: call.id, completedAt: new Date().toISOString(), outcome }),
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">Marcar llamada como realizada</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <p className="text-sm">{call.patientName} · {TYPE_LABELS[call.type] ?? call.type}</p>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Resumen / siguientes pasos (opcional)</label>
            <textarea className="input" rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Qué decidisteis, próximos pasos..." />
          </div>
          <button onClick={save} disabled={saving} className="btn btn-primary w-full">
            {saving ? "Guardando..." : "Marcar realizada"}
          </button>
        </div>
      </div>
    </div>
  );
}
