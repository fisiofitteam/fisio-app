"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { WorkoutTaskEditor } from "./tasks/WorkoutTaskEditor";
import { VideoTaskEditor } from "./tasks/VideoTaskEditor";
import { FormTaskEditor } from "./tasks/FormTaskEditor";
import { EvolutionTaskEditor } from "./tasks/EvolutionTaskEditor";

type Session = {
  id: string;
  scheduledDate: string;
  completedAt: string | null;
  weekNumber: number;
  programName: string;
  programType: string;
  tasksSnapshot: string;
  responses: string | null;
  formReviewedAt: string | null;
  isStandalone: boolean;
};

type Assignment = {
  id: string;
  programName: string;
  programType: string;
  programLevel: number;
  startDate: string;
  weeksCount: number;
  sessionCount: number;
};

type ProgramOption = {
  id: string;
  name: string;
  type: string;
  level: number;
  weeksCount: number;
};

const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAY_HEADERS = ["L","M","X","J","V","S","D"];

const TYPE_COLORS: Record<string, string> = {
  Movilidad: "bg-blue-100 text-blue-800",
  Tendinoso: "bg-purple-100 text-purple-800",
  Exposición: "bg-amber-100 text-amber-800",
  Fuerza: "bg-rose-100 text-rose-800",
  Activación: "bg-teal-100 text-teal-800",
  Cardio: "bg-cyan-100 text-cyan-800",
  Recuperación: "bg-emerald-100 text-emerald-800",
  Suelta: "bg-neutral-200 text-neutral-700",
};

function colorFor(type: string) {
  return TYPE_COLORS[type] ?? "bg-neutral-100 text-neutral-800";
}

export function CalendarMonth({
  patientId,
  year,
  month,
  sessions,
  activeAssignments,
  allPrograms,
}: {
  patientId: string;
  year: number;
  month: number;
  sessions: Session[];
  activeAssignments: Assignment[];
  allPrograms: ProgramOption[];
}) {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [assignmentModal, setAssignmentModal] = useState<{ date: string } | null>(null);
  const [addChoice, setAddChoice] = useState<{ date: string } | null>(null);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [dragging, setDragging] = useState<Session | null>(null);
  const [dropAction, setDropAction] = useState<{ session: Session; targetKey: string } | null>(null);

  const sessionsByDay = useMemo(() => {
    const map: Record<string, Session[]> = {};
    for (const s of sessions) {
      const d = new Date(s.scheduledDate);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [sessions]);

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const prevMonth = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  const nextMonth = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!e.over) return;
    const sessionId = String(e.active.id);
    const newDateKey = String(e.over.id);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const currentKey = dayKey(new Date(session.scheduledDate));
    if (currentKey === newDateKey) return;
    // En lugar de mover directamente, abrimos modal con elección
    setDropAction({ session, targetKey: newDateKey });
  }

  function onDragStart(e: any) {
    const session = sessions.find((s) => s.id === String(e.active.id));
    if (session) setDragging(session);
  }

  async function executeMove(session: Session, targetKey: string) {
    const newDate = parseKey(targetKey);
    const oldDate = new Date(session.scheduledDate);
    newDate.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);
    await fetch("/api/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: session.id, scheduledDate: newDate.toISOString() }),
    });
    router.refresh();
  }

  async function executeDuplicate(session: Session, targetKey: string) {
    const newDate = parseKey(targetKey);
    const oldDate = new Date(session.scheduledDate);
    newDate.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);
    const tasksSnapshot = JSON.parse(session.tasksSnapshot);
    // Regenerar ids dentro del snapshot para evitar colisiones
    const newSnapshot = tasksSnapshot.map((t: any) => ({
      ...t,
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    }));
    await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId,
        scheduledDate: newDate.toISOString(),
        title: session.isStandalone ? session.programName : `${session.programName} (copia)`,
        tasksSnapshot: newSnapshot,
      }),
    });
    router.refresh();
  }

  return (
    <div>
      <section className="card mb-4">
        <h2 className="font-medium mb-3">Programas activos</h2>
        {activeAssignments.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-4">No hay programas asignados. Asigna el primero o crea una sesión suelta.</p>
        ) : (
          <div className="space-y-2">
            {activeAssignments.map((a) => (
              <div key={a.id} className="flex justify-between items-center text-sm gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{a.programName}</div>
                  <div className="text-xs text-neutral-500">
                    {a.programType} · N{a.programLevel} · {a.weeksCount} sem · {a.sessionCount} sesiones
                  </div>
                </div>
                <div className="text-xs text-neutral-500">
                  desde {new Date(a.startDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                </div>
                <button
                  onClick={() => setEditingAssignment(a)}
                  className="text-xs text-neutral-500 hover:text-neutral-900 px-1.5"
                  title="Editar"
                >
                  ✎
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card mb-4">
        <div className="flex justify-between items-center mb-3">
          <Link href={`?y=${prevMonth.y}&m=${prevMonth.m}`} className="text-sm text-neutral-500 hover:text-neutral-900">
            ← {MONTH_NAMES[prevMonth.m].slice(0, 3)}
          </Link>
          <h2 className="font-medium">{MONTH_NAMES[month]} {year}</h2>
          <Link href={`?y=${nextMonth.y}&m=${nextMonth.m}`} className="text-sm text-neutral-500 hover:text-neutral-900">
            {MONTH_NAMES[nextMonth.m].slice(0, 3)} →
          </Link>
        </div>

        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="grid grid-cols-7 gap-1">
            {DAY_HEADERS.map((d) => (
              <div key={d} className="text-center text-xs text-neutral-400 py-1 font-medium">{d}</div>
            ))}
            {grid.map((day, i) => {
              const key = dayKey(day.date);
              const daySessions = sessionsByDay[key] ?? [];
              const today = isToday(day.date);
              return (
                <DroppableDay
                  key={i}
                  dateKey={key}
                  inMonth={day.inMonth}
                  today={today}
                  dayNumber={day.date.getDate()}
                  sessions={daySessions}
                  onClick={() => {
                    if (!day.inMonth) return;
                    if (daySessions.length > 0) setSelectedDay(key);
                    else setAddChoice({ date: key });
                  }}
                />
              );
            })}
          </div>
          <DragOverlay>
            {dragging && (
              <div className={`text-[10px] px-1 py-0.5 rounded shadow-md ${colorFor(dragging.programType)}`}>
                {dragging.programName}
              </div>
            )}
          </DragOverlay>
        </DndContext>

        <div className="mt-3 text-xs text-neutral-500 italic">
          💡 Click en un día vacío → crea sesión suelta o asigna programa · Arrastra sesiones entre días para mover o duplicar
        </div>
      </section>

      {selectedDay && (
        <DayDetail
          dateKey={selectedDay}
          sessions={sessionsByDay[selectedDay] ?? []}
          onClose={() => setSelectedDay(null)}
          onAssignMore={() => {
            const date = selectedDay;
            setSelectedDay(null);
            setAddChoice({ date });
          }}
          onEditSession={(s) => {
            setSelectedDay(null);
            setEditingSession(s);
          }}
        />
      )}

      {addChoice && (
        <AddOrAssignModal
          date={addChoice.date}
          allPrograms={allPrograms}
          onClose={() => setAddChoice(null)}
          onPickStandalone={() => {
            const date = addChoice.date;
            setAddChoice(null);
            createStandalone(patientId, date).then((newSession) => {
              setEditingSession(newSession);
              router.refresh();
            });
          }}
          onPickProgram={(date) => {
            setAddChoice(null);
            setAssignmentModal({ date });
          }}
        />
      )}

      {assignmentModal && (
        <AssignModal
          patientId={patientId}
          date={assignmentModal.date}
          programs={allPrograms}
          onClose={() => setAssignmentModal(null)}
          onAssigned={() => {
            setAssignmentModal(null);
            router.refresh();
          }}
        />
      )}

      {editingSession && (
        <EditSessionModal
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSaved={() => {
            setEditingSession(null);
            router.refresh();
          }}
          onDeleted={() => {
            setEditingSession(null);
            router.refresh();
          }}
        />
      )}

      {editingAssignment && (
        <EditAssignmentModal
          assignment={editingAssignment}
          patientId={patientId}
          onClose={() => setEditingAssignment(null)}
          onSaved={() => {
            setEditingAssignment(null);
            router.refresh();
          }}
        />
      )}

      {dropAction && (
        <DropActionModal
          session={dropAction.session}
          targetKey={dropAction.targetKey}
          onClose={() => setDropAction(null)}
          onMove={async () => {
            const { session, targetKey } = dropAction;
            setDropAction(null);
            await executeMove(session, targetKey);
          }}
          onDuplicate={async () => {
            const { session, targetKey } = dropAction;
            setDropAction(null);
            await executeDuplicate(session, targetKey);
          }}
        />
      )}
    </div>
  );
}

async function createStandalone(patientId: string, dateKey: string): Promise<Session> {
  const date = parseKey(dateKey);
  date.setHours(10, 0, 0, 0);
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patientId,
      scheduledDate: date.toISOString(),
      title: `Sesión ${date.toLocaleDateString("es-ES")}`,
      tasksSnapshot: [],
    }),
  });
  const created = await res.json();
  return {
    id: created.id,
    scheduledDate: created.scheduledDate,
    completedAt: null,
    weekNumber: 1,
    programName: `Sesión ${date.toLocaleDateString("es-ES")}`,
    programType: "Suelta",
    tasksSnapshot: "[]",
    responses: null,
    formReviewedAt: null,
    isStandalone: true,
  };
}

function DroppableDay({
  dateKey,
  inMonth,
  today,
  dayNumber,
  sessions,
  onClick,
}: {
  dateKey: string;
  inMonth: boolean;
  today: boolean;
  dayNumber: number;
  sessions: Session[];
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      disabled={!inMonth}
      className={`min-h-16 p-1 text-left rounded-lg border transition-colors ${
        inMonth
          ? today
            ? "border-neutral-900 bg-neutral-50"
            : isOver
            ? "border-amber-500 bg-amber-50"
            : "border-neutral-200 hover:bg-neutral-50"
          : "border-transparent text-neutral-300"
      }`}
    >
      <div className={`text-xs ${today ? "font-bold" : ""}`}>{dayNumber}</div>
      {sessions.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {sessions.slice(0, 2).map((s) => (
            <DraggableSession key={s.id} session={s} />
          ))}
          {sessions.length > 2 && <div className="text-[10px] text-neutral-500">+{sessions.length - 2}</div>}
        </div>
      )}
    </button>
  );
}

function DraggableSession({ session }: { session: Session }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: session.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 }
    : undefined;

  // Sacar el título visible de la sesión: primer task (o nombre programa si es standalone)
  let displayTitle: string | null = null;
  try {
    const tasks = JSON.parse(session.tasksSnapshot);
    if (Array.isArray(tasks) && tasks.length > 0) {
      // Si solo hay una tarea: ese es el título
      // Si hay varias: el de la primera (orden=0)
      const first = tasks[0];
      displayTitle = first.title || null;
      // Si hay más de una tarea, añadimos contador
      if (tasks.length > 1) {
        displayTitle = `${displayTitle} +${tasks.length - 1}`;
      }
    }
  } catch {}
  // Si es standalone (sesión suelta sin programa) usamos su programName
  if (!displayTitle && session.isStandalone) {
    displayTitle = session.programName;
  }
  // Si no hay nada que mostrar, no rendereamos (día de descanso, sesión vacía)
  if (!displayTitle) return null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`text-[10px] px-1 py-0.5 rounded truncate cursor-grab active:cursor-grabbing ${
        session.completedAt ? "bg-emerald-100 text-emerald-800" : colorFor(session.programType)
      }`}
    >
      {session.completedAt && "✓ "}
      {displayTitle}
    </div>
  );
}

function DayDetail({
  dateKey,
  sessions,
  onClose,
  onAssignMore,
  onEditSession,
}: {
  dateKey: string;
  sessions: Session[];
  onClose: () => void;
  onAssignMore: () => void;
  onEditSession: (s: Session) => void;
}) {
  const date = parseKey(dateKey);
  const router = useRouter();

  async function markReviewed(sessionId: string) {
    await fetch("/api/sessions/review-form", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-neutral-200 flex justify-between items-center">
          <h3 className="font-medium">
            {date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="p-4 space-y-3">
          {sessions.map((s) => {
            const tasks = JSON.parse(s.tasksSnapshot) as any[];
            const hasForm = tasks.some((t) => t.type === "FORM");
            const needsReview = hasForm && s.completedAt && !s.formReviewedAt;
            return (
              <div key={s.id} className="card">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-medium text-sm">{s.programName}</div>
                    <div className="text-xs text-neutral-500">
                      {s.isStandalone ? "Sesión suelta" : `Semana ${s.weekNumber}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onEditSession(s)}
                      className="text-xs text-neutral-600 hover:text-neutral-900"
                    >
                      ✏️ Editar
                    </button>
                    {s.completedAt ? <span className="pill-ok">✓</span> : <span className="text-xs text-neutral-400">Pendiente</span>}
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {tasks.length === 0 ? (
                    <p className="text-xs text-neutral-400 italic">Sesión vacía. Click en Editar para añadir tareas.</p>
                  ) : (
                    tasks.map((t, i) => (
                      <div key={i} className="border-l-2 border-neutral-200 pl-2">
                        <div className="text-xs text-neutral-500 uppercase">{t.type}</div>
                        <div className="font-medium text-sm">{t.title}</div>
                        {t.type === "WORKOUT" && t.bodyText && (
                          <pre className="text-xs text-neutral-700 whitespace-pre-wrap mt-1 font-mono">{t.bodyText}</pre>
                        )}
                      </div>
                    ))
                  )}
                </div>
                {s.responses && (
                  <div className="mt-3 pt-3 border-t border-neutral-100 text-xs text-neutral-600">
                    <ResponsesDisplay responses={s.responses} tasks={tasks} />
                  </div>
                )}
                {needsReview && (
                  <div className="mt-3 pt-3 border-t border-neutral-100">
                    <button onClick={() => markReviewed(s.id)} className="btn btn-primary text-xs w-full">
                      ✓ Marcar formulario como revisado
                    </button>
                  </div>
                )}
                {hasForm && s.formReviewedAt && (
                  <div className="mt-3 pt-3 border-t border-neutral-100 text-xs text-emerald-700">
                    ✓ Formulario revisado el {new Date(s.formReviewedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                  </div>
                )}
              </div>
            );
          })}

          <button onClick={onAssignMore} className="btn btn-ghost w-full text-sm">
            + Asignar programa o crear sesión suelta
          </button>
        </div>
      </div>
    </div>
  );
}

function ResponsesDisplay({ responses, tasks }: { responses: string; tasks: any[] }) {
  const parsed = JSON.parse(responses);
  return (
    <div className="space-y-1">
      {Object.entries(parsed).map(([taskId, resp]: [string, any]) => {
        const task = tasks.find((t) => t.id === taskId);
        if (!task) return null;
        return (
          <div key={taskId}>
            <div className="text-xs font-medium">{task.title}</div>
            {typeof resp === "object" ? (
              Object.entries(resp).map(([k, v]: [string, any]) => (
                <div key={k} className="text-xs">· {String(v)}</div>
              ))
            ) : (
              <div className="text-xs">{String(resp)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddOrAssignModal({
  date,
  allPrograms,
  onClose,
  onPickStandalone,
  onPickProgram,
}: {
  date: string;
  allPrograms: ProgramOption[];
  onClose: () => void;
  onPickStandalone: () => void;
  onPickProgram: (date: string) => void;
}) {
  const d = parseKey(date);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3">
          <h3 className="font-medium">¿Qué quieres añadir?</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            {d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        <div className="space-y-2">
          <button
            onClick={onPickStandalone}
            className="block w-full text-left px-3 py-3 rounded-lg hover:bg-neutral-100 border border-neutral-200"
          >
            <div className="font-medium text-sm">⚡ Sesión suelta</div>
            <div className="text-xs text-neutral-500 mt-0.5">Crea una sesión única para este día, sin programa</div>
          </button>
          <button
            onClick={() => onPickProgram(date)}
            disabled={allPrograms.length === 0}
            className="block w-full text-left px-3 py-3 rounded-lg hover:bg-neutral-100 border border-neutral-200 disabled:opacity-50"
          >
            <div className="font-medium text-sm">📋 Asignar programa completo</div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {allPrograms.length > 0 ? "Programa de la biblioteca empezando aquí" : "No tienes programas en biblioteca"}
            </div>
          </button>
        </div>

        <button onClick={onClose} className="mt-3 text-xs text-neutral-500 w-full text-center">Cancelar</button>
      </div>
    </div>
  );
}

function AssignModal({
  patientId,
  date,
  programs,
  onClose,
  onAssigned,
}: {
  patientId: string;
  date: string;
  programs: ProgramOption[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [selectedProgram, setSelectedProgram] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function assign() {
    if (!selectedProgram) return;
    setSaving(true);
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, programId: selectedProgram, startDate: date }),
    });
    onAssigned();
  }

  const d = parseKey(date);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3">
          <h3 className="font-medium">Asignar programa</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Empezando el {d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Programa</label>
            <select className="input" value={selectedProgram} onChange={(e) => setSelectedProgram(e.target.value)}>
              <option value="">— Elige programa —</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.type} · N{p.level} · {p.weeksCount} sem
                </option>
              ))}
            </select>
          </div>
          <button onClick={assign} disabled={!selectedProgram || saving} className="btn btn-primary w-full">
            {saving ? "Asignando..." : "Asignar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditSessionModal({
  session,
  onClose,
  onSaved,
  onDeleted,
}: {
  session: Session;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [tasks, setTasks] = useState<any[]>(JSON.parse(session.tasksSnapshot));
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const editingTask = tasks.find((t) => t.id === editingTaskId);

  function addTaskOfType(type: string) {
    const newTask: any = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      title: type === "WORKOUT" ? "Workout" : type === "VIDEO" ? "Vídeo" : type === "FORM" ? "Formulario" : "Registrar evolución",
      order: tasks.length,
    };
    if (type === "WORKOUT") { newTask.bodyText = ""; newTask.linkedExercises = []; }
    if (type === "VIDEO") { newTask.youtubeUrl = ""; newTask.description = ""; }
    if (type === "FORM") { newTask.questions = "[]"; }
    if (type === "EVOLUTION") { newTask.instructions = ""; }
    setTasks((prev) => [...prev, newTask]);
    setPickerOpen(false);
    setEditingTaskId(newTask.id);
  }

  function applyEditedTask(snapshot: any) {
    setTasks((prev) => prev.map((t) => (t.id === snapshot.id ? snapshot : t)));
  }

  function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  async function save() {
    setSaving(true);
    await fetch("/api/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: session.id, tasksSnapshot: tasks }),
    });
    onSaved();
  }

  async function remove() {
    if (!confirm("¿Eliminar esta sesión?")) return;
    await fetch(`/api/sessions?id=${session.id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 border-b border-neutral-200 flex justify-between items-center sticky top-0 bg-white z-10">
            <div>
              <h3 className="font-medium">Editar sesión</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                {new Date(session.scheduledDate).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                {session.isStandalone && " · Sesión suelta"}
              </p>
              {!session.isStandalone && (
                <p className="text-xs text-amber-700 mt-0.5 italic">
                  Estos cambios solo afectan a esta sesión, no al programa base.
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
          </div>

          <div className="p-4 space-y-3">
            {tasks.length === 0 && (
              <p className="text-sm text-neutral-400 italic text-center py-4">
                Esta sesión está vacía. Añade tareas debajo.
              </p>
            )}

            {tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => setEditingTaskId(t.id)}
                className="w-full text-left card !p-3 hover:border-neutral-400"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-neutral-500 uppercase">{t.type}</div>
                    <div className="font-medium text-sm">{t.title}</div>
                    {t.type === "WORKOUT" && t.bodyText && (
                      <pre className="text-xs text-neutral-600 whitespace-pre-wrap mt-1 font-mono line-clamp-3">{t.bodyText}</pre>
                    )}
                    {t.type === "VIDEO" && t.youtubeUrl && (
                      <div className="text-xs text-neutral-500 mt-1 truncate">{t.youtubeUrl}</div>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeTask(t.id); }}
                    className="text-xs text-red-600 px-2"
                  >✕</button>
                </div>
              </button>
            ))}

            <button onClick={() => setPickerOpen(true)} className="btn btn-ghost text-xs w-full">
              + Añadir nueva tarea
            </button>

            <div className="flex justify-between pt-3 border-t border-neutral-100">
              <button onClick={remove} className="text-xs text-red-600">🗑️ Eliminar sesión</button>
              <button onClick={save} disabled={saving} className="btn btn-primary">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {pickerOpen && (
        <TaskTypeModal
          onSelect={(type) => addTaskOfType(type)}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {editingTask && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={() => setEditingTaskId(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-200 flex justify-between items-center sticky top-0 bg-white">
              <h3 className="font-medium">Editar tarea</h3>
              <button onClick={() => setEditingTaskId(null)} className="text-neutral-400 text-xl">✕</button>
            </div>
            <div className="p-4">
              {editingTask.type === "WORKOUT" && (
                <WorkoutTaskEditor task={editingTask} onClose={() => setEditingTaskId(null)} onSave={applyEditedTask} />
              )}
              {editingTask.type === "VIDEO" && (
                <VideoTaskEditor task={editingTask} onClose={() => setEditingTaskId(null)} onSave={applyEditedTask} />
              )}
              {editingTask.type === "FORM" && (
                <FormTaskEditor task={editingTask} onClose={() => setEditingTaskId(null)} onSave={applyEditedTask} />
              )}
              {editingTask.type === "EVOLUTION" && (
                <EvolutionTaskEditor task={editingTask} onClose={() => setEditingTaskId(null)} onSave={applyEditedTask} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DropActionModal({
  session,
  targetKey,
  onClose,
  onMove,
  onDuplicate,
}: {
  session: Session;
  targetKey: string;
  onClose: () => void;
  onMove: () => void;
  onDuplicate: () => void;
}) {
  const target = parseKey(targetKey);
  const origin = new Date(session.scheduledDate);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3">
          <h3 className="font-medium">¿Qué hacer con la sesión?</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            <strong>{session.programName}</strong>
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            Origen: {origin.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
          </p>
          <p className="text-xs text-neutral-500">
            Destino: {target.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
          </p>
        </div>

        <div className="space-y-2">
          <button
            onClick={onMove}
            className="block w-full text-left px-3 py-3 rounded-lg hover:bg-neutral-100 border border-neutral-200"
          >
            <div className="font-medium text-sm">➡️ Mover</div>
            <div className="text-xs text-neutral-500 mt-0.5">La sesión cambia de día. Desaparece del día original.</div>
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

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const firstDow = first.getDay() === 0 ? 7 : first.getDay();
  const grid: { date: Date; inMonth: boolean }[] = [];
  for (let i = firstDow - 1; i > 0; i--) {
    const d = new Date(first);
    d.setDate(first.getDate() - i);
    grid.push({ date: d, inMonth: false });
  }
  for (let i = 1; i <= last.getDate(); i++) {
    grid.push({ date: new Date(year, month, i), inMonth: true });
  }
  while (grid.length % 7 !== 0) {
    const lastDate = grid[grid.length - 1].date;
    const d = new Date(lastDate);
    d.setDate(lastDate.getDate() + 1);
    grid.push({ date: d, inMonth: false });
  }
  return grid;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function parseKey(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function EditAssignmentModal({
  assignment,
  patientId,
  onClose,
  onSaved,
}: {
  assignment: Assignment;
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [startDate, setStartDate] = useState(assignment.startDate.split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function saveDate() {
    setError("");
    setSaving(true);
    const res = await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: assignment.id,
        startDate: new Date(startDate).toISOString(),
      }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo guardar");
      setSaving(false);
    }
  }

  async function deactivate() {
    if (!confirm(`¿Desactivar el programa "${assignment.programName}"?\n\nLas sesiones quedarán como histórico de lectura. Esta acción NO borra ningún dato.`)) {
      return;
    }
    setSaving(true);
    const res = await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: assignment.id, isActive: false }),
    });
    if (res.ok) onSaved();
    else { setError("No se pudo desactivar"); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">Editar programa</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          <strong>{assignment.programName}</strong> — {assignment.programType} N{assignment.programLevel}
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Fecha de inicio</label>
            <input
              type="date"
              className="input text-sm w-full"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="text-[10px] text-neutral-500 mt-1 italic">
              Si cambias la fecha, las sesiones futuras no completadas se moverán proporcionalmente. Las ya completadas se quedan en su sitio.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={saveDate}
            disabled={saving}
            className="w-full text-sm font-medium"
            style={{ background: "#0A0A0A", color: "#FAFAFA", padding: 11, borderRadius: 10, border: "none", opacity: saving ? 0.5 : 1 }}
          >
            {saving ? "Guardando..." : "Guardar fecha"}
          </button>

          <div className="pt-3 border-t border-neutral-200">
            <button
              onClick={deactivate}
              disabled={saving}
              className="w-full text-sm font-medium text-red-600 hover:bg-red-50 py-2 rounded-lg"
            >
              Desactivar programa
            </button>
            <p className="text-[10px] text-neutral-500 mt-1 italic text-center">
              El histórico de sesiones se conserva.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
