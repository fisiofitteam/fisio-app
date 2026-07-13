"use client";

/**
 * Panel para que el fisio personalice el rolling de un atleta concreto.
 * Muestra las 2 semanas próximas (actual + siguiente) del rolling asignado,
 * con cada tarea del rolling y la posibilidad de:
 *   - Modificar título / cuerpo / vídeo (solo para este atleta).
 *   - Ocultar la tarea para este atleta.
 *   - Quitar el override (vuelve al original).
 *
 * Solo lectura del rolling maestro — no toca las tareas de todos, solo
 * inserta un PatientRollingTaskOverride que se aplica al renderizar.
 */

import { useEffect, useState } from "react";
import { Pencil, EyeOff, RotateCcw, X, Save } from "lucide-react";

type RollingTask = {
  id: string;
  type: string;
  title: string;
  bodyText: string | null;
  videoId: string | null;
  order: number;
};
type RollingDay = { dayOfWeek: number; tasks: RollingTask[] };
type RollingWeek = {
  id: string;
  weekStartDate: string;
  title: string | null;
  publishedAt: string | null;
  days: RollingDay[];
};
type ProgramWeeks = {
  programId: string;
  programName: string;
  weeks: RollingWeek[];   // [actual, siguiente]
};

type Override = {
  taskId: string;
  hidden: boolean;
  title: string | null;
  bodyText: string | null;
  videoId: string | null;
};

const DAY_NAMES = ["", "Lun", "Mar", "Mié", "Jue", "Vie"];

export function PatientRollingOverridesPanel({
  patientId,
  patientName,
  accessoriesId,
  trainingId,
}: {
  patientId: string;
  patientName: string;
  accessoriesId: string | null;
  trainingId: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [acc, setAcc] = useState<ProgramWeeks | null>(null);
  const [trn, setTrn] = useState<ProgramWeeks | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!expanded) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (accessoriesId) params.set("accessoriesId", accessoriesId);
    if (trainingId) params.set("trainingId", trainingId);
    Promise.all([
      fetch(`/api/rolling-two-weeks?${params.toString()}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/patient-rolling-overrides?patientId=${patientId}`).then((r) => r.json()).catch(() => null),
    ]).then(([twData, ovData]) => {
      if (twData?.ok) {
        setAcc(twData.accessories ?? null);
        setTrn(twData.training ?? null);
      }
      if (ovData?.ok) {
        const map: Record<string, Override> = {};
        for (const o of ovData.overrides ?? []) map[o.taskId] = o;
        setOverrides(map);
      }
      setLoading(false);
    });
  }, [expanded, patientId, accessoriesId, trainingId]);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 3500);
  }

  async function saveOverride(taskId: string, patch: Partial<Override>) {
    const current = overrides[taskId] ?? { taskId, hidden: false, title: null, bodyText: null, videoId: null };
    const next = { ...current, ...patch };
    setOverrides((prev) => ({ ...prev, [taskId]: next }));
    const res = await fetch("/api/patient-rolling-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...next, patientId, taskId }),
    });
    if (!res.ok) flash("err", "No se pudo guardar el cambio");
    else flash("ok", "Cambio guardado para " + patientName);
  }

  async function removeOverride(taskId: string) {
    setOverrides((prev) => {
      const copy = { ...prev };
      delete copy[taskId];
      return copy;
    });
    await fetch(`/api/patient-rolling-overrides?patientId=${patientId}&taskId=${taskId}`, { method: "DELETE" });
    flash("ok", "Vuelve al original");
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-medium">Personalizar sesión rolling</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Modifica u oculta tareas del rolling solo para <strong>{patientName}</strong>. El programa maestro no se toca.
          </p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium px-3 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50"
        >
          {expanded ? "Ocultar" : "Ver 2 semanas próximas"}
        </button>
      </div>

      {msg && (
        <div className={`text-xs px-3 py-2 rounded-lg ${msg.kind === "ok" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {expanded && (
        loading ? (
          <p className="text-xs text-neutral-500 italic">Cargando…</p>
        ) : (
          <div className="space-y-4">
            {acc && <ProgramSection label="Accesorios" color="#3B82F6" data={acc} overrides={overrides} onSaveOverride={saveOverride} onRemoveOverride={removeOverride} editingTaskId={editingTaskId} setEditingTaskId={setEditingTaskId} />}
            {trn && <ProgramSection label="Entrenamiento" color="#F59E0B" data={trn} overrides={overrides} onSaveOverride={saveOverride} onRemoveOverride={removeOverride} editingTaskId={editingTaskId} setEditingTaskId={setEditingTaskId} />}
            {!acc && !trn && (
              <p className="text-xs text-neutral-500 italic">No hay contenido programado en las próximas 2 semanas.</p>
            )}
          </div>
        )
      )}
    </section>
  );
}

function ProgramSection({
  label, color, data, overrides, onSaveOverride, onRemoveOverride, editingTaskId, setEditingTaskId,
}: {
  label: string;
  color: string;
  data: ProgramWeeks;
  overrides: Record<string, Override>;
  onSaveOverride: (taskId: string, patch: Partial<Override>) => Promise<void>;
  onRemoveOverride: (taskId: string) => Promise<void>;
  editingTaskId: string | null;
  setEditingTaskId: (id: string | null) => void;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: color + "22", color }}>
          {label.toUpperCase()}
        </span>
        <span className="text-xs text-neutral-600 truncate">{data.programName}</span>
      </div>

      {data.weeks.length === 0 ? (
        <p className="text-[11px] text-neutral-500 italic">Sin semanas programadas.</p>
      ) : (
        <div className="space-y-3">
          {data.weeks.map((w) => (
            <div key={w.id} className="rounded-lg border border-neutral-200 bg-white p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-semibold">
                  Semana del {new Date(w.weekStartDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                  {w.title && <span className="ml-2 text-neutral-500 font-normal">· {w.title}</span>}
                </div>
                {!w.publishedAt && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">Borrador</span>}
              </div>
              {w.days.length === 0 ? (
                <p className="text-[11px] text-neutral-400 italic">Sin días programados.</p>
              ) : (
                <div className="space-y-2">
                  {w.days.map((d) => (
                    <div key={d.dayOfWeek} className="flex items-start gap-2">
                      <div className="text-[10px] font-bold text-neutral-500 uppercase w-8 pt-1">{DAY_NAMES[d.dayOfWeek]}</div>
                      <div className="flex-1 space-y-1.5">
                        {d.tasks.length === 0 ? (
                          <div className="text-[11px] text-neutral-400 italic">—</div>
                        ) : (
                          d.tasks.map((t) => (
                            <TaskRow
                              key={t.id}
                              task={t}
                              override={overrides[t.id]}
                              editing={editingTaskId === t.id}
                              onEdit={() => setEditingTaskId(t.id)}
                              onCancelEdit={() => setEditingTaskId(null)}
                              onSave={(patch) => { onSaveOverride(t.id, patch); setEditingTaskId(null); }}
                              onHide={() => onSaveOverride(t.id, { hidden: true })}
                              onRestore={() => onRemoveOverride(t.id)}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task, override, editing, onEdit, onCancelEdit, onSave, onHide, onRestore,
}: {
  task: RollingTask;
  override?: Override;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Partial<Override>) => void;
  onHide: () => void;
  onRestore: () => void;
}) {
  const [title, setTitle] = useState(override?.title ?? task.title);
  const [body, setBody] = useState(override?.bodyText ?? task.bodyText ?? "");

  useEffect(() => {
    setTitle(override?.title ?? task.title);
    setBody(override?.bodyText ?? task.bodyText ?? "");
  }, [override, task]);

  const isHidden = !!override?.hidden;
  const isModified = !isHidden && !!override && (override.title !== null || override.bodyText !== null || override.videoId !== null);

  if (editing) {
    return (
      <div className="rounded-md border border-blue-300 bg-blue-50/50 p-2">
        <input
          className="input text-xs w-full mb-1.5"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título"
        />
        <textarea
          className="input text-xs w-full font-mono"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Cuerpo (opcional)"
        />
        <div className="flex justify-end gap-1 mt-1.5">
          <button onClick={onCancelEdit} className="text-[11px] px-2 py-1 rounded hover:bg-neutral-200">
            <X size={12} className="inline" /> Cancelar
          </button>
          <button
            onClick={() => onSave({ title: title.trim() || null, bodyText: body.trim() || null, hidden: false })}
            className="text-[11px] font-semibold px-2 py-1 rounded bg-blue-600 text-white"
          >
            <Save size={12} className="inline" /> Guardar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-md p-2 border transition-colors ${
        isHidden ? "border-red-200 bg-red-50/30" :
        isModified ? "border-amber-300 bg-amber-50/40" :
        "border-neutral-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-medium ${isHidden ? "line-through text-neutral-400" : ""}`}>
            {override?.title ?? task.title}
            {isModified && <span className="ml-2 text-[9px] font-bold text-amber-700">MODIFICADO</span>}
            {isHidden && <span className="ml-2 text-[9px] font-bold text-red-700">OCULTO</span>}
          </div>
          {(override?.bodyText ?? task.bodyText) && !isHidden && (
            <div className="text-[10px] text-neutral-500 mt-0.5 line-clamp-2 whitespace-pre-wrap">
              {override?.bodyText ?? task.bodyText}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {(isHidden || isModified) && (
            <button onClick={onRestore} title="Volver al original" className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700">
              <RotateCcw size={12} />
            </button>
          )}
          <button onClick={onEdit} title="Modificar para este atleta" className="p-1 rounded hover:bg-blue-100 text-neutral-400 hover:text-blue-700">
            <Pencil size={12} />
          </button>
          {!isHidden && (
            <button onClick={onHide} title="Ocultar para este atleta" className="p-1 rounded hover:bg-red-100 text-neutral-400 hover:text-red-700">
              <EyeOff size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
