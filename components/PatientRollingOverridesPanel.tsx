"use client";

/**
 * Panel para que el fisio personalice el rolling de un atleta concreto.
 * Muestra las 2 semanas próximas (actual + siguiente) del rolling asignado
 * con la MISMA visual que /fisio/rolling-lectura (RollingReadOnlyList):
 * card por semana + border-l-2 por día + tareas compactas. Al pulsar el
 * lápiz en una tarea se abre edición inline para modificar título/cuerpo
 * SOLO para ese atleta. Nunca toca el rolling maestro.
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
  weeks: RollingWeek[];
};

type Override = {
  taskId: string;
  hidden: boolean;
  title: string | null;
  bodyText: string | null;
  videoId: string | null;
};

const DAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

const TYPE_ICONS: Record<string, string> = {
  WORKOUT: "💪",
  VIDEO: "🎥",
  FORM: "📝",
  EVOLUTION: "📊",
};

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
    else flash("ok", `Cambio guardado para ${patientName}`);
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

  const hasContent = acc || trn;

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
        ) : !hasContent ? (
          <p className="text-xs text-neutral-500 italic">No hay contenido programado en las próximas 2 semanas.</p>
        ) : (
          <div className="space-y-6">
            {acc && (
              <ProgramReadOnly
                label="Accesorios"
                color="#3B82F6"
                data={acc}
                overrides={overrides}
                editingTaskId={editingTaskId}
                setEditingTaskId={setEditingTaskId}
                saveOverride={saveOverride}
                removeOverride={removeOverride}
              />
            )}
            {trn && (
              <ProgramReadOnly
                label="Entrenamiento"
                color="#F59E0B"
                data={trn}
                overrides={overrides}
                editingTaskId={editingTaskId}
                setEditingTaskId={setEditingTaskId}
                saveOverride={saveOverride}
                removeOverride={removeOverride}
              />
            )}
          </div>
        )
      )}
    </section>
  );
}

// ────────────────────────── Vista tipo RollingReadOnlyList ──────────────────────────

function ProgramReadOnly({
  label, color, data, overrides, editingTaskId, setEditingTaskId, saveOverride, removeOverride,
}: {
  label: string;
  color: string;
  data: ProgramWeeks;
  overrides: Record<string, Override>;
  editingTaskId: string | null;
  setEditingTaskId: (id: string | null) => void;
  saveOverride: (taskId: string, patch: Partial<Override>) => Promise<void>;
  removeOverride: (taskId: string) => Promise<void>;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: color + "22", color }}>
          {label.toUpperCase()}
        </span>
        <span className="text-xs text-neutral-600 truncate">{data.programName}</span>
      </div>

      {data.weeks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 py-6 text-center text-xs text-neutral-500 italic">
          Sin semanas programadas.
        </div>
      ) : (
        <div className="space-y-3">
          {data.weeks.map((w) => (
            <div key={w.id} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm">
                  Semana del {new Date(w.weekStartDate).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}
                  {w.title && <span className="ml-2 text-neutral-500 font-normal">· {w.title}</span>}
                </h3>
                {!w.publishedAt && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                    Borrador
                  </span>
                )}
              </div>

              {w.days.length === 0 ? (
                <p className="text-xs text-neutral-400 italic">Sin días programados.</p>
              ) : (
                <div className="space-y-3">
                  {w.days.map((d) => (
                    <div key={d.dayOfWeek} className="border-l-2 border-neutral-200 pl-3">
                      <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">
                        {DAY_NAMES[d.dayOfWeek]}
                      </div>
                      {d.tasks.length === 0 ? (
                        <div className="text-xs text-neutral-400 italic">—</div>
                      ) : (
                        <div className="space-y-1.5">
                          {d.tasks.map((t) => (
                            <TaskEditableRow
                              key={t.id}
                              task={t}
                              override={overrides[t.id]}
                              editing={editingTaskId === t.id}
                              onEdit={() => setEditingTaskId(t.id)}
                              onCancelEdit={() => setEditingTaskId(null)}
                              onSave={(patch) => { saveOverride(t.id, patch); setEditingTaskId(null); }}
                              onHide={() => saveOverride(t.id, { hidden: true })}
                              onRestore={() => removeOverride(t.id)}
                            />
                          ))}
                        </div>
                      )}
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

function TaskEditableRow({
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

  // Estado edición: fondo azul, inputs, save/cancel
  if (editing) {
    return (
      <div className="rounded-md border-2 border-blue-400 bg-blue-50/50 p-3">
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="text-sm">{TYPE_ICONS[task.type] || "•"}</span>
          <input
            className="flex-1 text-sm font-medium bg-white border border-neutral-300 rounded px-2 py-1 outline-none focus:border-blue-500"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título"
            autoFocus
          />
        </div>
        <textarea
          className="w-full text-xs text-neutral-700 bg-white border border-neutral-300 rounded px-2 py-1.5 font-mono outline-none focus:border-blue-500"
          rows={Math.max(3, Math.min(10, (body.match(/\n/g)?.length ?? 0) + 2))}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Cuerpo (opcional)"
        />
        <div className="flex justify-end gap-1 mt-2">
          <button onClick={onCancelEdit} className="text-[11px] px-2 py-1 rounded hover:bg-neutral-200 text-neutral-600 flex items-center gap-1">
            <X size={12} /> Cancelar
          </button>
          <button
            onClick={() => onSave({ title: title.trim() || null, bodyText: body.trim() || null, hidden: false })}
            className="text-[11px] font-semibold px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1"
          >
            <Save size={12} /> Guardar para este atleta
          </button>
        </div>
      </div>
    );
  }

  // Vista normal: card compacta con hover para mostrar acciones
  const displayTitle = override?.title ?? task.title;
  const displayBody = override?.bodyText ?? task.bodyText;

  const rowBg = isHidden
    ? "border-red-200 bg-red-50/40"
    : isModified
      ? "border-amber-300 bg-amber-50/50"
      : "border-neutral-200 bg-neutral-50 hover:bg-white";

  return (
    <div className={`group rounded-md border p-2.5 transition-colors ${rowBg}`}>
      <div className="flex items-start gap-2">
        <span className="text-sm mt-0.5">{TYPE_ICONS[task.type] || "•"}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${isHidden ? "line-through text-neutral-400" : ""}`}>
            {displayTitle}
            {isModified && (
              <span className="ml-2 text-[9px] font-bold text-amber-700 uppercase tracking-wider">Modificado</span>
            )}
            {isHidden && (
              <span className="ml-2 text-[9px] font-bold text-red-700 uppercase tracking-wider">Oculto</span>
            )}
          </div>
          {displayBody && !isHidden && (
            <div className="text-xs text-neutral-600 mt-1 whitespace-pre-wrap">
              {displayBody}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 md:opacity-0 group-hover:opacity-100 transition-opacity">
          {(isHidden || isModified) && (
            <button
              onClick={onRestore}
              title="Volver al original"
              className="p-1.5 rounded hover:bg-neutral-200 text-neutral-400 hover:text-neutral-700"
            >
              <RotateCcw size={13} />
            </button>
          )}
          <button
            onClick={onEdit}
            title="Modificar para este atleta"
            className="p-1.5 rounded hover:bg-blue-100 text-neutral-400 hover:text-blue-700"
          >
            <Pencil size={13} />
          </button>
          {!isHidden && (
            <button
              onClick={onHide}
              title="Ocultar para este atleta"
              className="p-1.5 rounded hover:bg-red-100 text-neutral-400 hover:text-red-700"
            >
              <EyeOff size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
