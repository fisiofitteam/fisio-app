"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
} from "@dnd-kit/core";
import { TaskTypeModal } from "./TaskTypeModal";
import { TaskEditorModal } from "./TaskEditorModal";

const DAY_HEADERS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

const TYPE_LABELS: Record<string, string> = {
  WORKOUT: "Workout",
  VIDEO: "Vídeo",
  FORM: "Formulario",
  EVOLUTION: "Registrar evolución",
};

const TYPE_COLORS: Record<string, string> = {
  WORKOUT: "bg-amber-100 text-amber-900 border-amber-200",
  VIDEO: "bg-rose-100 text-rose-900 border-rose-200",
  FORM: "bg-emerald-100 text-emerald-900 border-emerald-200",
  EVOLUTION: "bg-sky-100 text-sky-900 border-sky-200",
};

type Task = {
  id: string;
  title: string;
  type: string;
  order: number;
};

type DragTarget = {
  task: Task;
  sourceWeekId: string;
  sourceDayOfWeek: number;
  targetWeekId: string;
  targetDayOfWeek: number;
};

export function ProgramEditor({ program }: { program: any }) {
  const router = useRouter();
  const [typeModal, setTypeModal] = useState<{ weekId: string; dayOfWeek: number } | null>(null);
  const [taskModal, setTaskModal] = useState<{ taskId: string } | null>(null);
  const [dragging, setDragging] = useState<{ task: Task; sourceWeekId: string; sourceDayOfWeek: number } | null>(null);
  const [dropAction, setDropAction] = useState<DragTarget | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function addTaskOfType(type: string) {
    if (!typeModal) return;
    const res = await fetch("/api/programs/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programId: program.id,
        weekId: typeModal.weekId,
        dayOfWeek: typeModal.dayOfWeek,
        type,
      }),
    });
    const data = await res.json();
    setTypeModal(null);
    setTaskModal({ taskId: data.id });
    router.refresh();
  }

  async function addWeek() {
    const res = await fetch("/api/programs/weeks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId: program.id }),
    });
    if (res.ok) router.refresh();
  }

  async function deleteWeek(weekId: string) {
    if (!confirm("¿Eliminar esta semana? Se borrarán todas sus tareas.")) return;
    const r = await fetch(`/api/programs/weeks?id=${weekId}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d?.error ?? `No se pudo borrar (HTTP ${r.status})`);
      return;
    }
    router.refresh();
  }

  async function duplicateWeek(weekId: string) {
    const res = await fetch("/api/programs/weeks/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekId }),
    });
    if (res.ok) router.refresh();
  }

  async function deleteTask(taskId: string) {
    if (!confirm("¿Eliminar esta tarea?")) return;
    await fetch(`/api/programs/tasks?id=${taskId}`, { method: "DELETE" });
    router.refresh();
  }

  async function executeMoveOrDuplicate(target: DragTarget, action: "move" | "duplicate") {
    await fetch("/api/programs/tasks/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: target.task.id,
        targetWeekId: target.targetWeekId,
        targetDayOfWeek: target.targetDayOfWeek,
        action,
      }),
    });
    setDropAction(null);
    router.refresh();
  }

  function onDragStart(e: any) {
    const id = String(e.active.id);
    const data = e.active.data.current as { task: Task; weekId: string; dayOfWeek: number };
    if (data) {
      setDragging({ task: data.task, sourceWeekId: data.weekId, sourceDayOfWeek: data.dayOfWeek });
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const current = dragging;
    setDragging(null);
    if (!e.over || !current) return;
    const dropData = e.over.data.current as { weekId: string; dayOfWeek: number };
    if (!dropData) return;
    if (dropData.weekId === current.sourceWeekId && dropData.dayOfWeek === current.sourceDayOfWeek) return;
    setDropAction({
      task: current.task,
      sourceWeekId: current.sourceWeekId,
      sourceDayOfWeek: current.sourceDayOfWeek,
      targetWeekId: dropData.weekId,
      targetDayOfWeek: dropData.dayOfWeek,
    });
  }

  // Asegurar que tenemos un slot por semana para los 5 días (vacíos si no existen)
  const weeks = program.weeks.map((w: any) => {
    const daysByDow: Record<number, any> = {};
    for (const d of w.days) daysByDow[d.dayOfWeek] = d;
    return { ...w, daysByDow };
  });

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="space-y-6">
          {weeks.map((w: any) => (
            <section key={w.id} className="border border-neutral-200 rounded-xl p-4 bg-white">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium">Semana {w.weekNumber}</h3>
                <div className="flex gap-2">
                  <button onClick={() => duplicateWeek(w.id)} className="text-xs text-neutral-500 hover:text-neutral-900">
                    ⎘ Duplicar
                  </button>
                  <button onClick={() => deleteWeek(w.id)} className="text-xs text-red-600">
                    ✕ Eliminar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((dow) => {
                  const day = w.daysByDow[dow];
                  const tasks: Task[] = day?.tasks ?? [];
                  return (
                    <DroppableDayCell
                      key={dow}
                      weekId={w.id}
                      dayOfWeek={dow}
                      title={DAY_HEADERS[dow - 1]}
                    >
                      {tasks.map((t) => (
                        <DraggableTask
                          key={t.id}
                          task={t}
                          weekId={w.id}
                          dayOfWeek={dow}
                          onEdit={() => setTaskModal({ taskId: t.id })}
                          onDelete={() => deleteTask(t.id)}
                        />
                      ))}
                      <button
                        onClick={() => setTypeModal({ weekId: w.id, dayOfWeek: dow })}
                        className="text-xs text-neutral-400 border border-dashed border-neutral-300 rounded py-1.5 hover:bg-white hover:text-neutral-700"
                      >
                        + tarea
                      </button>
                    </DroppableDayCell>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="text-center">
            <button onClick={addWeek} className="btn btn-ghost text-sm">
              + Añadir semana
            </button>
          </div>

          <div className="text-xs text-neutral-500 italic text-center">
            💡 Arrastra tareas entre días o semanas para mover o duplicar
          </div>
        </div>

        <DragOverlay>
          {dragging && (
            <div className={`text-xs rounded px-2 py-1.5 border shadow-md ${TYPE_COLORS[dragging.task.type] ?? "bg-neutral-100 border-neutral-200"}`}>
              <div className="font-medium truncate">{dragging.task.title}</div>
              <div className="text-[10px] opacity-70 mt-0.5">{TYPE_LABELS[dragging.task.type]}</div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {typeModal && (
        <TaskTypeModal
          onSelect={addTaskOfType}
          onClose={() => setTypeModal(null)}
        />
      )}

      {taskModal && (
        <TaskEditorModal
          taskId={taskModal.taskId}
          onClose={() => {
            setTaskModal(null);
            router.refresh();
          }}
        />
      )}

      {dropAction && (
        <MoveOrDuplicateModal
          target={dropAction}
          program={program}
          onClose={() => setDropAction(null)}
          onMove={() => executeMoveOrDuplicate(dropAction, "move")}
          onDuplicate={() => executeMoveOrDuplicate(dropAction, "duplicate")}
        />
      )}
    </>
  );
}

function DroppableDayCell({
  weekId,
  dayOfWeek,
  title,
  children,
}: {
  weekId: string;
  dayOfWeek: number;
  title: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${weekId}-${dayOfWeek}`,
    data: { weekId, dayOfWeek },
  });

  return (
    <div
      ref={setNodeRef}
      className={`border rounded-lg min-h-32 flex flex-col transition-colors ${
        isOver ? "border-amber-500 bg-amber-50" : "border-neutral-200 bg-neutral-50"
      }`}
    >
      <div className="text-xs font-medium text-center py-2 border-b border-neutral-200 text-neutral-600">
        {title}
      </div>
      <div className="p-2 flex-1 flex flex-col gap-1.5">
        {children}
      </div>
    </div>
  );
}

function DraggableTask({
  task,
  weekId,
  dayOfWeek,
  onEdit,
  onDelete,
}: {
  task: Task;
  weekId: string;
  dayOfWeek: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task, weekId, dayOfWeek },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.3 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`text-xs rounded px-2 py-1.5 border cursor-grab active:cursor-grabbing ${TYPE_COLORS[task.type] ?? "bg-neutral-100 border-neutral-200"}`}
    >
      <div className="flex justify-between items-start gap-1">
        <div {...listeners} {...attributes} className="flex-1 min-w-0">
          <div className="font-medium truncate">{task.title}</div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="opacity-50 hover:opacity-100"
            title="Editar"
          >
            ✎
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="opacity-50 hover:opacity-100"
            title="Eliminar"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="text-[10px] opacity-70 mt-0.5">{TYPE_LABELS[task.type]}</div>
    </div>
  );
}

function MoveOrDuplicateModal({
  target,
  program,
  onClose,
  onMove,
  onDuplicate,
}: {
  target: DragTarget;
  program: any;
  onClose: () => void;
  onMove: () => void;
  onDuplicate: () => void;
}) {
  const sourceWeek = program.weeks.find((w: any) => w.id === target.sourceWeekId);
  const targetWeek = program.weeks.find((w: any) => w.id === target.targetWeekId);
  const sourceLabel = `Semana ${sourceWeek?.weekNumber} · ${DAY_HEADERS[target.sourceDayOfWeek - 1]}`;
  const targetLabel = `Semana ${targetWeek?.weekNumber} · ${DAY_HEADERS[target.targetDayOfWeek - 1]}`;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3">
          <h3 className="font-medium">¿Qué hacer con la tarea?</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            <strong>{target.task.title}</strong>
          </p>
          <p className="text-xs text-neutral-500 mt-1">Origen: {sourceLabel}</p>
          <p className="text-xs text-neutral-500">Destino: {targetLabel}</p>
        </div>

        <div className="space-y-2">
          <button
            onClick={onMove}
            className="block w-full text-left px-3 py-3 rounded-lg hover:bg-neutral-100 border border-neutral-200"
          >
            <div className="font-medium text-sm">➡️ Mover</div>
            <div className="text-xs text-neutral-500 mt-0.5">La tarea cambia de día. Desaparece del día original.</div>
          </button>
          <button
            onClick={onDuplicate}
            className="block w-full text-left px-3 py-3 rounded-lg hover:bg-neutral-100 border border-neutral-200"
          >
            <div className="font-medium text-sm">📑 Duplicar</div>
            <div className="text-xs text-neutral-500 mt-0.5">Se crea una copia en el día destino. La original se mantiene.</div>
          </button>
        </div>

        <button onClick={onClose} className="mt-3 text-xs text-neutral-500 w-full text-center">Cancelar</button>
      </div>
    </div>
  );
}
