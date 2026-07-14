"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
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
import { colorForSession, colorForTask, buildAssignmentIndexMap } from "@/lib/session-colors";

type Session = {
  id: string;
  scheduledDate: string;
  completedAt: string | null;
  weekNumber: number;
  /** Programa (assignment) al que pertenece — se usa para asignar
   *  color rotativo verde/amarillo/violeta/naranja entre programas del
   *  paciente. Opcional para compat retro; si falta cae al color por
   *  defecto. */
  assignmentId?: string;
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
const DAY_HEADERS_WEEKDAYS = ["L","M","X","J","V"];
const DAY_HEADERS_FULL = ["L","M","X","J","V","S","D"];
const WEEKEND_TOGGLE_STORAGE_KEY = "calendarMonth:showWeekends";

// TYPE_COLORS legacy: se conserva únicamente para el overlay del drag
// (donde se dibuja un chip con el nombre del programa fuera del contexto
// de la sesión concreta). Todas las tarjetas de sesión pasan por
// colorForSession (lib/session-colors), que decide por tarea + índice
// de asignación.
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
  // Estado local de mes/año. Inicial = lo que viene del server (URL). Cambiar
  // localmente nos permite auto-avanzar durante un arrastre sin perder el drag
  // (los datos de ±2 meses ya vienen pre-cargados desde el server).
  const [currentYear, setCurrentYear] = useState(year);
  const [currentMonth, setCurrentMonth] = useState(month);
  // Si el server nos pasa otro mes (porque el usuario tocó la URL), nos
  // resincronizamos.
  useEffect(() => {
    setCurrentYear(year);
    setCurrentMonth(month);
  }, [year, month]);

  // Toggle "mostrar sábado y domingo". Por defecto ON; persistimos elección
  // por navegador para que no haya que volver a activarlo cada vez.
  const [showWeekends, setShowWeekends] = useState(true);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(WEEKEND_TOGGLE_STORAGE_KEY);
      if (stored === "false") setShowWeekends(false);
    } catch { /* localStorage bloqueado → nos quedamos con ON */ }
  }, []);
  function toggleWeekends() {
    setShowWeekends((v) => {
      const next = !v;
      try { window.localStorage.setItem(WEEKEND_TOGGLE_STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [assignmentModal, setAssignmentModal] = useState<{ date: string } | null>(null);
  const [addChoice, setAddChoice] = useState<{ date: string } | null>(null);
  // Modal de "Sesión suelta" con opción de recurrencia. Aparece tras
  // pulsar ⚡ Sesión suelta en AddOrAssignModal. Si el fisio elige
  // "solo este día" crea 1; si activa recurrencia, crea varias.
  // Nota: standaloneRecurrenceModal (creación con recurrencia previa a
  // meter contenido) se retiró — el fisio pedía crear vacía, meter
  // contenido, y decidir replicar DESPUÉS desde el editor. El componente
  // StandaloneRecurrenceModal sigue en el archivo por si se recupera el flujo.
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [dragging, setDragging] = useState<Session | null>(null);
  const [dropAction, setDropAction] = useState<{ session: Session; targetKey: string } | null>(null);
  const [moveToDateSession, setMoveToDateSession] = useState<Session | null>(null);

  // Auto-avance al mantener el arrastre sobre las flechas de prev/next mes.
  // Mantenemos un timer y la "zona" sobre la que está el drag para arrancarlo
  // solo una vez por hover.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceZone = useRef<"prev" | "next" | null>(null);
  const [advancePending, setAdvancePending] = useState<"prev" | "next" | null>(null);

  function clearAdvance() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    advanceZone.current = null;
    setAdvancePending(null);
  }

  function scheduleAdvance(dir: "prev" | "next") {
    if (advanceZone.current === dir) return; // ya programado
    clearAdvance();
    advanceZone.current = dir;
    setAdvancePending(dir);
    advanceTimer.current = setTimeout(() => {
      // Ejecutar el cambio de mes localmente
      switchMonthLocal(dir === "prev" ? -1 : 1);
      // Re-arrancar para permitir saltos consecutivos (otro hold = otro mes)
      advanceZone.current = null;
      setAdvancePending(null);
      advanceTimer.current = null;
    }, 500);
  }

  function switchMonthLocal(delta: number) {
    let m = currentMonth + delta;
    let y = currentYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setCurrentMonth(m);
    setCurrentYear(y);
  }

  function navigateMonth(delta: number) {
    // Navegación normal (no durante drag): cambia estado local + URL.
    let m = currentMonth + delta;
    let y = currentYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setCurrentMonth(m);
    setCurrentYear(y);
    router.push(`?y=${y}&m=${m}`);
  }

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

  // Índice estable por assignment del paciente (para asignar el color
  // verde/amarillo/violeta/naranja). Ordenado por startDate.
  const assignmentIndex = useMemo(
    () => buildAssignmentIndexMap(activeAssignments),
    [activeAssignments]
  );

  const grid = useMemo(
    () => buildMonthGrid(currentYear, currentMonth, showWeekends),
    [currentYear, currentMonth, showWeekends]
  );
  const dayHeaders = showWeekends ? DAY_HEADERS_FULL : DAY_HEADERS_WEEKDAYS;
  const gridColsClass = showWeekends ? "grid-cols-7" : "grid-cols-5";
  const prevMonth = currentMonth === 0 ? { y: currentYear - 1, m: 11 } : { y: currentYear, m: currentMonth - 1 };
  const nextMonth = currentMonth === 11 ? { y: currentYear + 1, m: 0 } : { y: currentYear, m: currentMonth + 1 };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    clearAdvance();
    if (!e.over) return;
    const overId = String(e.over.id);
    // Si soltó sobre las zonas de auto-avance, no hacemos nada (era solo para
    // cambiar de mes; ya se aplicó si mantuvo 500ms).
    if (overId === "__prev_month__" || overId === "__next_month__") return;
    const sessionId = String(e.active.id);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const currentKey = dayKey(new Date(session.scheduledDate));
    if (currentKey === overId) return;
    // Sesiones completadas: el arrastre SIEMPRE duplica (no abrimos modal).
    // Mover una completada cambiaría la fecha de cuando se hizo, que rara vez
    // es lo que se quiere; lo natural es crear una nueva copia limpia.
    if (session.completedAt) {
      executeDuplicate(session, overId);
      return;
    }
    // No completada: abrimos el modal con elección Mover/Duplicar como siempre.
    setDropAction({ session, targetKey: overId });
  }

  function onDragStart(e: any) {
    const session = sessions.find((s) => s.id === String(e.active.id));
    if (session) setDragging(session);
  }

  function onDragOver(e: DragOverEvent) {
    const overId = e.over?.id ? String(e.over.id) : null;
    if (overId === "__prev_month__") scheduleAdvance("prev");
    else if (overId === "__next_month__") scheduleAdvance("next");
    else clearAdvance();
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
    // Regenerar ids dentro del snapshot para evitar colisiones y limpiar
    // cualquier rastro de completado/respuesta por tarea (por si alguna vez
    // un task type guardó estado en el propio snapshot). El nuevo registro
    // de sesión nace sin completedAt y sin responses.
    const newSnapshot = tasksSnapshot.map((t: any) => {
      const { completed, completedAt, response, responses, ...rest } = t;
      return {
        ...rest,
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      };
    });
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
                  {(() => {
                    const end = new Date(a.startDate);
                    end.setDate(end.getDate() + a.weeksCount * 7);
                    const dl = Math.ceil((end.getTime() - Date.now()) / 86400000);
                    if (dl < 0 || dl > 7) return null;
                    return (
                      <div className="text-xs font-medium mt-0.5" style={{ color: "#B45309" }}>
                        🔔 menos de una semana para terminar
                      </div>
                    );
                  })()}
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
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver}>
          <div className="flex justify-between items-center mb-3">
            <MonthNavZone
              dir="prev"
              label={`← ${MONTH_NAMES[prevMonth.m].slice(0, 3)}`}
              onClick={() => navigateMonth(-1)}
              pending={advancePending === "prev"}
              dragging={!!dragging}
            />
            <h2 className="font-medium">{MONTH_NAMES[currentMonth]} {currentYear}</h2>
            <MonthNavZone
              dir="next"
              label={`${MONTH_NAMES[nextMonth.m].slice(0, 3)} →`}
              onClick={() => navigateMonth(1)}
              pending={advancePending === "next"}
              dragging={!!dragging}
            />
          </div>
          <div className={`grid ${gridColsClass} gap-1`}>
            {dayHeaders.map((d, i) => (
              <div
                key={d + i}
                className={`text-center text-xs py-1 font-medium ${
                  i >= 5 ? "text-neutral-300" : "text-neutral-400"
                }`}
              >
                {d}
              </div>
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
                  assignmentIndex={assignmentIndex}
                  onClick={() => {
                    if (!day.inMonth) return;
                    if (daySessions.length > 0) setSelectedDay(key);
                    else setAddChoice({ date: key });
                  }}
                  onMoveToDate={(s) => setMoveToDateSession(s)}
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
          💡 Click en día vacío → crea sesión o asigna programa · Arrastra entre días para mover/duplicar (las ✓ completadas siempre se duplican) · Mantén el arrastre sobre ← o → para cambiar de mes · Usa el botón ↗ del chip para saltar a cualquier fecha
        </div>
        <div className="mt-2 text-right">
          <button
            type="button"
            onClick={toggleWeekends}
            className="text-[11px] text-neutral-400 hover:text-neutral-700 hover:underline"
            title={showWeekends ? "Ocultar sábado y domingo del calendario" : "Mostrar sábado y domingo en el calendario"}
          >
            {showWeekends ? "Ocultar fin de semana" : "Mostrar fin de semana"}
          </button>
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
          onPickStandalone={async () => {
            // Nuevo flujo: crear la sesion suelta VACIA directamente y abrir
            // el editor. La opcion "recurrente" ya no aparece aqui — vive
            // en el editor como boton "🔁 Replicar en mas dias" (que ya
            // usa el contenido guardado).
            const date = addChoice.date;
            setAddChoice(null);
            const d = parseKey(date);
            const baseDateIso = (() => {
              const dt = new Date(d);
              dt.setHours(10, 0, 0, 0);
              return dt.toISOString();
            })();
            try {
              const res = await fetch("/api/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  patientId,
                  scheduledDate: baseDateIso,
                  title: `Sesión ${d.toLocaleDateString("es-ES")}`,
                  tasksSnapshot: [],
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data?.error || "No se pudo crear la sesión");
              const newSession: Session = {
                id: data.id,
                scheduledDate: data.scheduledDate,
                completedAt: null,
                weekNumber: 1,
                programName: `Sesión ${d.toLocaleDateString("es-ES")}`,
                programType: "Suelta",
                tasksSnapshot: "[]",
                responses: null,
                formReviewedAt: null,
                isStandalone: true,
              };
              setEditingSession(newSession);
              router.refresh();
            } catch (e: any) {
              alert(e?.message || "Error creando sesión");
            }
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
          patientId={patientId}
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

      {moveToDateSession && (
        <MoveToDateModal
          session={moveToDateSession}
          onClose={() => setMoveToDateSession(null)}
          onMove={async (targetKey) => {
            const s = moveToDateSession;
            setMoveToDateSession(null);
            await executeMove(s, targetKey);
          }}
          onDuplicate={async (targetKey) => {
            const s = moveToDateSession;
            setMoveToDateSession(null);
            await executeDuplicate(s, targetKey);
          }}
        />
      )}
    </div>
  );
}

// Botón de navegación de mes que además es zona droppable: si mantienes un
// drag encima 500ms, el mes cambia automáticamente y el arrastre continúa.
function MonthNavZone({
  dir,
  label,
  onClick,
  pending,
  dragging,
}: {
  dir: "prev" | "next";
  label: string;
  onClick: () => void;
  pending: boolean;
  dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dir === "prev" ? "__prev_month__" : "__next_month__" });
  const highlight = dragging && (isOver || pending);
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className="text-sm px-2 py-1 rounded transition-colors"
      style={{
        background: highlight ? "#FEF3C7" : "transparent",
        color: highlight ? "#92400E" : "#737373",
        border: dragging ? "1px dashed " + (highlight ? "#F59E0B" : "#E5E5E5") : "1px solid transparent",
      }}
      title={dragging ? "Mantén el arrastre aquí para cambiar de mes" : label}
    >
      {label}
      {pending && <span className="ml-1 animate-pulse">…</span>}
    </button>
  );
}

// Modal para mover/duplicar una sesión a cualquier fecha (incluyendo otros meses).
function MoveToDateModal({
  session,
  onClose,
  onMove,
  onDuplicate,
}: {
  session: Session;
  onClose: () => void;
  onMove: (targetKey: string) => Promise<void>;
  onDuplicate: (targetKey: string) => Promise<void>;
}) {
  const currentKey = dayKey(new Date(session.scheduledDate));
  const [target, setTarget] = useState(currentKey);
  const [busy, setBusy] = useState<"move" | "dup" | null>(null);
  const isCompleted = !!session.completedAt;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium text-sm">
            {isCompleted ? "↗ Duplicar sesión completada" : "↗ Mover sesión a otra fecha"}
          </h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none px-2">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-3">
          {session.programName} · {isCompleted ? "completada el " : "actualmente "}
          {new Date(session.scheduledDate).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
        </p>
        {isCompleted && (
          <p className="text-[11px] text-neutral-500 italic mb-3">
            Las sesiones completadas no se mueven (su fecha es histórica). Aquí se crea una copia nueva sin marcar como completada.
          </p>
        )}
        <div className="mb-4">
          <label className="text-xs text-neutral-500 block mb-1.5">Nueva fecha</label>
          <input
            type="date"
            className="input text-sm w-full"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={async () => { setBusy("dup"); await onDuplicate(target); }}
            disabled={busy !== null || target === currentKey}
            className={`text-sm px-3 py-2 rounded-lg disabled:opacity-50 ${isCompleted ? "font-semibold" : ""}`}
            style={
              isCompleted
                ? { background: "#0A0A0A", color: "#FAFAFA" }
                : { background: "#F5F5F5", color: "#0A0A0A", border: "1px solid #E5E5E5" }
            }
          >
            {busy === "dup" ? "..." : "Duplicar aquí"}
          </button>
          {!isCompleted && (
            <button
              onClick={async () => { setBusy("move"); await onMove(target); }}
              disabled={busy !== null || target === currentKey}
              className="text-sm font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              {busy === "move" ? "..." : "Mover aquí"}
            </button>
          )}
        </div>
      </div>
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
  assignmentIndex,
  onClick,
  onMoveToDate,
}: {
  dateKey: string;
  inMonth: boolean;
  today: boolean;
  dayNumber: number;
  sessions: Session[];
  assignmentIndex: Map<string, number>;
  onClick: () => void;
  onMoveToDate: (s: Session) => void;
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
          {/* Pintamos TODAS las sesiones. Si un día tiene muchas (varios
              programas asignados), la celda crece hacia abajo — el user
              prefiere ver la lista completa antes que el resumen "+N". */}
          {sessions.map((s) => (
            <DraggableSession
              key={s.id}
              session={s}
              assignmentIndex={assignmentIndex}
              onMoveToDate={() => onMoveToDate(s)}
            />
          ))}
        </div>
      )}
    </button>
  );
}

function DraggableSession({
  session,
  assignmentIndex,
  onMoveToDate,
}: {
  session: Session;
  assignmentIndex: Map<string, number>;
  onMoveToDate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: session.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 }
    : undefined;

  // Parseamos las tareas y las mostramos como filas independientes,
  // cada una con su propio color según su tipo (VIDEO=rojo,
  // EVOLUTION/FORM=azul claro, resto=color de la asignación). Así el
  // fisio ve directamente cada tarea en el calendario, sin "+N".
  let tasks: any[] = [];
  try {
    const parsed = JSON.parse(session.tasksSnapshot);
    if (Array.isArray(parsed)) tasks = parsed;
  } catch {}

  // Si es sesión standalone sin tareas, dejamos la fila con el nombre
  // del programa (comportamiento histórico).
  const fallbackLabel = tasks.length === 0 && session.isStandalone
    ? session.programName
    : null;
  if (tasks.length === 0 && !fallbackLabel) return null;

  const isCompleted = !!session.completedAt;
  const idx = session.assignmentId ? (assignmentIndex.get(session.assignmentId) ?? 0) : 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="relative group cursor-grab active:cursor-grabbing space-y-0.5"
      title={isCompleted ? "Arrastra para duplicar esta sesión completada en otro día" : "Arrastra para mover o duplicar"}
    >
      {fallbackLabel ? (
        // Sesión sin tareas: una sola fila neutra con el nombre.
        (() => {
          const cSess = colorForSession({
            tasksSnapshot: session.tasksSnapshot,
            assignmentIndex: idx,
            completed: isCompleted,
          });
          return (
            <div
              className={`text-[10px] px-1 py-0.5 pr-4 rounded truncate ${cSess.bgClass} ${cSess.textClass}`}
            >
              {isCompleted && "✓ "}
              {fallbackLabel}
            </div>
          );
        })()
      ) : (
        tasks.map((t, i) => {
          const c = colorForTask({
            taskType: t?.type,
            assignmentIndex: idx,
            completed: isCompleted,
          });
          const title = String(t?.title ?? "").trim() || "(sin título)";
          return (
            <div
              key={t?.id ?? i}
              className={`text-[10px] px-1 py-0.5 rounded truncate ${c.bgClass} ${c.textClass} ${i === 0 ? "pr-4" : ""}`}
            >
              {isCompleted && i === 0 && "✓ "}
              {title}
            </div>
          );
        })
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onMoveToDate(); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute right-0.5 top-0 px-1 text-[10px] leading-none rounded hover:bg-black/10"
        title={isCompleted ? "Duplicar a otra fecha" : "Mover a otra fecha (cualquier mes)"}
      >
        ↗
      </button>
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
  // Buscador: filtra por nombre o tipo. Reemplaza al <select> nativo, que
  // se hacía ingobernable cuando la biblioteca tiene muchos programas.
  const [search, setSearch] = useState("");

  const selected = programs.find((p) => p.id === selectedProgram) ?? null;

  const filtered = programs.filter((p) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      p.type.toLowerCase().includes(s) ||
      `n${p.level}`.includes(s)
    );
  });

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
      <div className="bg-white rounded-2xl max-w-md w-full p-4 max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex-shrink-0">
          <h3 className="font-medium">Asignar programa</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Empezando el {d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        <div className="space-y-3 flex flex-col min-h-0 flex-1">
          {selected ? (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{selected.name}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {selected.type} · N{selected.level} · {selected.weeksCount} sem
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedProgram(""); setSearch(""); }}
                  className="text-xs text-neutral-500 hover:text-neutral-900 underline flex-shrink-0"
                >
                  Cambiar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Buscar programa</label>
                <div className="relative">
                  <input
                    className="input pl-8 text-sm"
                    placeholder="🔍 Por nombre, tipo o nivel (ej. N2)"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 text-xs"
                      type="button"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto -mx-1 px-1 min-h-[120px] max-h-[50vh]">
                {filtered.length === 0 ? (
                  <p className="text-xs text-neutral-400 text-center py-6 italic">
                    {programs.length === 0
                      ? "No tienes programas en biblioteca."
                      : "No hay programas que coincidan."}
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {filtered.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedProgram(p.id)}
                          className="w-full text-left p-2.5 rounded-lg hover:bg-neutral-100 border border-neutral-200 transition"
                        >
                          <div className="font-medium text-sm">{p.name}</div>
                          <div className="text-xs text-neutral-500 mt-0.5">
                            {p.type} · N{p.level} · {p.weeksCount} sem
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
          <button
            onClick={assign}
            disabled={!selectedProgram || saving}
            className="btn btn-primary w-full flex-shrink-0"
          >
            {saving ? "Asignando..." : "Asignar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditSessionModal({
  session,
  patientId,
  onClose,
  onSaved,
  onDeleted,
}: {
  session: Session;
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [tasks, setTasks] = useState<any[]>(JSON.parse(session.tasksSnapshot));
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [replicateOpen, setReplicateOpen] = useState(false);

  const editingTask = tasks.find((t) => t.id === editingTaskId);

  function addTaskOfType(type: string) {
    const newTask: any = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      title: type === "WORKOUT" ? "Workout" : type === "VIDEO" ? "Vídeo" : type === "FORM" ? "Formulario" : "Registrar evolución",
      order: tasks.length,
    };
    if (type === "WORKOUT") { newTask.bodyText = ""; newTask.exercises = []; }
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

  /** Persiste los cambios actuales en el server y devuelve. Se usa cuando
   *  el fisio pulsa "🔁 Replicar" antes de guardar — asegura que la
   *  sesión original queda con el contenido correcto en BD antes de crear
   *  las copias, sin cerrar el editor. */
  async function saveInPlace() {
    await fetch("/api/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: session.id, tasksSnapshot: tasks }),
    });
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

            <div className="flex justify-between items-center pt-3 border-t border-neutral-100 flex-wrap gap-2">
              <button onClick={remove} className="text-xs text-red-600">🗑️ Eliminar sesión</button>
              <div className="flex items-center gap-2">
                {session.isStandalone && tasks.length > 0 && (
                  <button
                    onClick={async () => {
                      // Guarda la sesión original antes de abrir el modal —
                      // así la sesión "madre" no queda vacía si el fisio
                      // no había pulsado Guardar todavía.
                      setSaving(true);
                      try { await saveInPlace(); } catch {}
                      setSaving(false);
                      setReplicateOpen(true);
                    }}
                    disabled={saving}
                    className="text-xs font-medium px-3 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
                    title="Guarda esta sesión y crea copias con el mismo contenido en otros días"
                  >
                    🔁 Guardar y replicar en más días
                  </button>
                )}
                <button onClick={save} disabled={saving} className="btn btn-primary">
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
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

      {replicateOpen && (
        <ReplicateSessionModal
          session={session}
          patientId={patientId}
          tasks={tasks}
          onClose={() => setReplicateOpen(false)}
          onReplicated={() => { setReplicateOpen(false); onSaved(); }}
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
                <EvolutionTaskEditor task={editingTask} onClose={() => setEditingTaskId(null)} onSave={applyEditedTask} patientId={patientId} />
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

function buildMonthGrid(year: number, month: number, showWeekends: boolean) {
  // Grid de días del mes alineado a un múltiplo de columnas.
  // Si showWeekends=true: 7 columnas L-D, incluye sábados y domingos.
  // Si showWeekends=false: 5 columnas L-V, salta fines de semana.
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const firstDow = first.getDay() === 0 ? 7 : first.getDay(); // 1=L .. 7=D
  const grid: { date: Date; inMonth: boolean }[] = [];
  const columns = showWeekends ? 7 : 5;
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  if (showWeekends) {
    // Padding inicial: retroceder hasta el lunes previo (o del mes anterior).
    for (let i = firstDow - 1; i > 0; i--) {
      const d = new Date(first);
      d.setDate(first.getDate() - i);
      grid.push({ date: d, inMonth: false });
    }
    // Días del mes (todos)
    for (let i = 1; i <= last.getDate(); i++) {
      const d = new Date(year, month, i);
      grid.push({ date: d, inMonth: true });
    }
  } else {
    // Padding inicial: solo laborables del mes anterior
    if (firstDow >= 2 && firstDow <= 5) {
      for (let i = firstDow - 1; i > 0; i--) {
        const d = new Date(first);
        d.setDate(first.getDate() - i);
        grid.push({ date: d, inMonth: false });
      }
    }
    // Si día 1 es sábado o domingo, saltamos al siguiente lunes
    const startOffset = firstDow >= 6 ? 8 - firstDow : 0;
    // Días del mes (solo L-V)
    for (let i = 1 + startOffset; i <= last.getDate(); i++) {
      const d = new Date(year, month, i);
      if (isWeekend(d)) continue;
      grid.push({ date: d, inMonth: true });
    }
  }

  // Padding final: completar hasta múltiplo de columnas
  while (grid.length % columns !== 0) {
    const lastDate = grid[grid.length - 1].date;
    let d = new Date(lastDate);
    d.setDate(lastDate.getDate() + 1);
    if (!showWeekends) {
      while (isWeekend(d)) d.setDate(d.getDate() + 1);
    }
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
    if (!confirm(`¿Desactivar el programa "${assignment.programName}"?\n\nSe conservan las sesiones pasadas y completadas como histórico.\nLas sesiones futuras no completadas se eliminarán.`)) {
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
              Sesiones pasadas y completadas se conservan. Futuras se borran.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal de creación de sesión suelta con opción de recurrencia.
 *
 * Dos modos:
 *  - "single": crea una sola sesión en la fecha clicada (comportamiento
 *    histórico). Tras crear, la abre en EditSessionModal vía onCreatedSingle
 *    para que el fisio meta tareas.
 *  - "recurring": pide días de la semana y N semanas, llama al endpoint
 *    con `recurrence` y crea N sesiones. Avisa al padre con onCreatedMany
 *    para que refresque (no abrimos editor: serían muchos).
 */
function StandaloneRecurrenceModal({
  patientId,
  date,
  onClose,
  onCreatedSingle,
  onCreatedMany,
}: {
  patientId: string;
  date: string;
  onClose: () => void;
  onCreatedSingle: (session: Session) => void;
  onCreatedMany: () => void;
}) {
  const d = parseKey(date);
  const baseDow = d.getDay() === 0 ? 7 : d.getDay();

  const [mode, setMode] = useState<"single" | "recurring">("single");
  // Por defecto, el día clicado queda preseleccionado en la recurrencia
  // para que el fisio solo añada o quite días.
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([baseDow]);
  const [weeks, setWeeks] = useState<number>(4);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(dow: number) {
    setDaysOfWeek((prev) =>
      prev.includes(dow) ? prev.filter((x) => x !== dow) : [...prev, dow].sort((a, b) => a - b)
    );
  }

  // Cálculo de "te van a salir N sesiones" para el preview honesto.
  // Replicamos la regla del backend: en la 1ª semana solo cuenta días
  // >= baseDate; el día clicado siempre cuenta aunque caiga "antes".
  const previewCount = (() => {
    if (mode === "single") return 1;
    if (daysOfWeek.length === 0) return 0;
    let n = 0;
    for (let w = 0; w < weeks; w++) {
      for (const dx of daysOfWeek) {
        if (w === 0 && dx < baseDow) continue;
        n++;
      }
    }
    return n;
  })();

  async function create() {
    setError(null);
    setSaving(true);
    const baseDateIso = (() => {
      const dt = parseKey(date);
      dt.setHours(10, 0, 0, 0);
      return dt.toISOString();
    })();
    const body: any = {
      patientId,
      scheduledDate: baseDateIso,
      title: `Sesión ${d.toLocaleDateString("es-ES")}`,
      tasksSnapshot: [],
    };
    if (mode === "recurring") {
      if (daysOfWeek.length === 0) {
        setError("Selecciona al menos un día de la semana");
        setSaving(false);
        return;
      }
      body.recurrence = { daysOfWeek, weeks };
    }
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo crear la sesión");

      if (mode === "single") {
        // Compat: backend devuelve la sesión pelada cuando no hay recurrencia.
        const session: Session = {
          id: data.id,
          scheduledDate: data.scheduledDate,
          completedAt: null,
          weekNumber: 1,
          programName: `Sesión ${d.toLocaleDateString("es-ES")}`,
          programType: "Suelta",
          tasksSnapshot: "[]",
          responses: null,
          formReviewedAt: null,
          isStandalone: true,
        };
        onCreatedSingle(session);
      } else {
        onCreatedMany();
      }
    } catch (e: any) {
      setError(e?.message || "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3">
          <h3 className="font-medium">⚡ Sesión suelta</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Empezando el {d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        <div className="space-y-3">
          {/* Toggle modo */}
          <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode("single")}
              className={`flex-1 text-xs px-2 py-1.5 rounded font-medium transition ${
                mode === "single" ? "bg-white shadow-sm" : "text-neutral-500"
              }`}
            >
              Solo este día
            </button>
            <button
              type="button"
              onClick={() => setMode("recurring")}
              className={`flex-1 text-xs px-2 py-1.5 rounded font-medium transition ${
                mode === "recurring" ? "bg-white shadow-sm" : "text-neutral-500"
              }`}
            >
              🔁 Repetir varias semanas
            </button>
          </div>

          {mode === "recurring" && (
            <>
              <div>
                <label className="text-xs text-neutral-500 block mb-1.5">Días de la semana</label>
                <div className="flex gap-1 flex-wrap">
                  {[
                    { dow: 1, label: "L" },
                    { dow: 2, label: "M" },
                    { dow: 3, label: "X" },
                    { dow: 4, label: "J" },
                    { dow: 5, label: "V" },
                    { dow: 6, label: "S" },
                    { dow: 7, label: "D" },
                  ].map(({ dow, label }) => {
                    const active = daysOfWeek.includes(dow);
                    return (
                      <button
                        key={dow}
                        type="button"
                        onClick={() => toggleDay(dow)}
                        className={`flex-1 min-w-[36px] py-2 rounded-lg border text-sm font-medium ${
                          active
                            ? "bg-neutral-900 text-white border-neutral-900"
                            : "bg-white border-neutral-200 text-neutral-700"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-500 block mb-1">Durante</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={52}
                    className="input w-24 text-sm"
                    value={weeks}
                    onChange={(e) => setWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
                  />
                  <span className="text-sm text-neutral-600">semana{weeks === 1 ? "" : "s"}</span>
                </div>
              </div>

              <div className="rounded-lg p-2 text-xs" style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", color: "#075985" }}>
                Se crearán <strong>{previewCount}</strong> sesión{previewCount === 1 ? "" : "es"} a partir de esta fecha.
                Cada una vacía: se editan después desde el calendario.
              </div>
            </>
          )}

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
            <button onClick={onClose} className="text-sm text-neutral-500 px-3 py-2">Cancelar</button>
            <button
              onClick={create}
              disabled={saving || (mode === "recurring" && previewCount === 0)}
              className="btn btn-primary text-sm disabled:opacity-50"
            >
              {saving
                ? "Creando…"
                : mode === "single"
                  ? "Crear sesión"
                  : `Crear ${previewCount} sesion${previewCount === 1 ? "" : "es"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal para REPLICAR una sesión existente (que ya tiene contenido) en
 * varios días. A diferencia de StandaloneRecurrenceModal — que se abre al
 * crear una sesión desde 0 y por eso genera sesiones vacías — este modal
 * hereda el `tasks` de la sesión actual y lo replica en cada nueva copia.
 *
 * Uso: el fisio crea la sesión, la rellena con tareas, y luego pulsa
 * "🔁 Replicar en más días" en el EditSessionModal.
 */
function ReplicateSessionModal({
  session,
  patientId,
  tasks,
  onClose,
  onReplicated,
}: {
  session: Session;
  patientId: string;
  tasks: any[];
  onClose: () => void;
  onReplicated: () => void;
}) {
  const baseDate = new Date(session.scheduledDate);
  const baseDow = baseDate.getDay() === 0 ? 7 : baseDate.getDay();
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([baseDow]);
  const [weeks, setWeeks] = useState<number>(4);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(dow: number) {
    setDaysOfWeek((prev) =>
      prev.includes(dow) ? prev.filter((x) => x !== dow) : [...prev, dow].sort((a, b) => a - b),
    );
  }

  // Preview: mismo cálculo que StandaloneRecurrenceModal.
  const previewCount = (() => {
    if (daysOfWeek.length === 0) return 0;
    let n = 0;
    for (let w = 0; w < weeks; w++) {
      for (const dx of daysOfWeek) {
        if (w === 0 && dx < baseDow) continue;
        n++;
      }
    }
    // La sesión original ya existe → no la duplicamos. Restamos 1 si la
    // primera ocurrencia coincide con el día base.
    if (daysOfWeek.includes(baseDow)) n = Math.max(0, n - 1);
    return n;
  })();

  async function replicate() {
    setError(null);
    if (daysOfWeek.length === 0) {
      setError("Selecciona al menos un día de la semana");
      return;
    }
    if (previewCount === 0) {
      setError("La selección actual no genera copias adicionales");
      return;
    }
    setSaving(true);
    try {
      // Empezamos DESPUÉS del día base para no duplicar la sesión actual.
      // Si el día base está en daysOfWeek, la primera ocurrencia coincide
      // y hay que saltarla → cogemos el día siguiente como scheduledDate.
      let startDate = new Date(baseDate);
      startDate.setDate(startDate.getDate() + 1);
      startDate.setHours(10, 0, 0, 0);

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          scheduledDate: startDate.toISOString(),
          title: `Sesión copia de ${baseDate.toLocaleDateString("es-ES")}`,
          tasksSnapshot: tasks,
          recurrence: { daysOfWeek, weeks },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo replicar");
      onReplicated();
    } catch (e: any) {
      setError(e?.message || "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  const dayLabels = ["L", "M", "X", "J", "V", "S", "D"];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3">
          <h3 className="font-medium">🔁 Replicar sesión</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Se crearán copias de esta sesión (con sus <strong>{tasks.length}</strong> {tasks.length === 1 ? "tarea" : "tareas"}) en los días que elijas.
            La original del {baseDate.toLocaleDateString("es-ES", { day: "numeric", month: "long" })} queda como está.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-2">Días de la semana</label>
            <div className="flex gap-1">
              {dayLabels.map((label, i) => {
                const dow = i + 1;
                const active = daysOfWeek.includes(dow);
                return (
                  <button
                    key={dow}
                    onClick={() => toggleDay(dow)}
                    className={`flex-1 py-2 text-xs font-medium rounded ${
                      active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Durante cuántas semanas</label>
            <select
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="input text-sm w-full"
            >
              {[1, 2, 3, 4, 6, 8, 12].map((w) => (
                <option key={w} value={w}>{w} semana{w === 1 ? "" : "s"}</option>
              ))}
            </select>
          </div>

          <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2 text-xs text-neutral-700">
            📊 Se crearán <strong>{previewCount}</strong> {previewCount === 1 ? "copia" : "copias"} adicionales con el mismo contenido.
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="btn btn-ghost text-sm flex-1">Cancelar</button>
            <button
              onClick={replicate}
              disabled={saving || previewCount === 0}
              className="btn btn-primary text-sm flex-1"
            >
              {saving ? "Replicando…" : `Replicar (${previewCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
