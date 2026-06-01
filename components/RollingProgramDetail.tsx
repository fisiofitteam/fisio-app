"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

type Program = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

type Task = {
  id: string;
  type: string;
  title: string;
  order: number;
  bodyText: string | null;
  videoId: string | null;
  formId: string | null;
};

type LibraryVideo = {
  id: string;
  title: string;
  youtubeUrl: string;
  category: string;
};

type Day = {
  id: string;
  dayOfWeek: number;
  tasks: Task[];
};

type WeekFull = {
  id: string;
  weekStartDate: string;
  title: string | null;
  notes: string | null;
  publishedAt: string | null;
  days: Day[];
};

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

function weekStartOfDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

function formatWeekLabel(iso: string): string {
  const d = new Date(iso);
  const end = new Date(d);
  end.setDate(d.getDate() + 4); // L-V = 5 días
  const startStr = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const endStr = end.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${startStr} – ${endStr}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(d.getDate() + n);
  return x;
}

export function RollingProgramDetail({
  program,
  patients,
  isManager,
}: {
  program: Program;
  patients: { id: string; fullName: string }[];
  isManager: boolean;
}) {
  const today = new Date();
  const thisMonday = weekStartOfDate(today);

  const [currentMonday, setCurrentMonday] = useState<Date>(thisMonday);
  const [week, setWeek] = useState<WeekFull | null>(null);
  const [loading, setLoading] = useState(true);

  // Drag & drop state
  const [dragging, setDragging] = useState<{ task: Task; dayOfWeek: number } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [moveModal, setMoveModal] = useState<{ task: Task; targetDayOfWeek: number } | null>(null);

  // Modales add/edit task
  const [typeModal, setTypeModal] = useState<{ dayOfWeek: number } | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);

  // Cargar semana
  async function loadWeek(monday: Date) {
    setLoading(true);
    const res = await fetch(
      `/api/rolling-weeks?programId=${program.id}&weekDate=${monday.toISOString()}`
    );
    if (res.ok) {
      const data = await res.json();
      setWeek(data.week);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadWeek(currentMonday);
  }, [currentMonday.toISOString()]);

  // Si la semana no existe en BD, ofrecemos crearla
  async function startThisWeek() {
    const res = await fetch("/api/rolling-weeks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programId: program.id,
        weekStartDate: currentMonday.toISOString(),
      }),
    });
    if (res.ok) await loadWeek(currentMonday);
  }

  // Publicar / despublicar
  async function togglePublish() {
    if (!week) return;
    await fetch("/api/rolling-weeks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programId: program.id,
        weekStartDate: currentMonday.toISOString(),
        publish: !week.publishedAt,
      }),
    });
    await loadWeek(currentMonday);
  }

  // Crear tarea
  async function addTaskOfType(type: string) {
    if (!typeModal || !week) return;
    const res = await fetch("/api/rolling-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekId: week.id, dayOfWeek: typeModal.dayOfWeek, type }),
    });
    const task = await res.json();
    setTypeModal(null);
    setEditTask(task);
    await loadWeek(currentMonday);
  }

  async function deleteTask(taskId: string) {
    if (!confirm("¿Eliminar esta tarea?")) return;
    await fetch(`/api/rolling-tasks?id=${taskId}`, { method: "DELETE" });
    await loadWeek(currentMonday);
  }

  // Drag & drop
  function onDragStart(e: any) {
    const data = e.active.data.current;
    setDragging({ task: data.task, dayOfWeek: data.dayOfWeek });
  }

  async function onDragEnd(e: DragEndEvent) {
    const current = dragging;
    setDragging(null);
    if (!e.over || !current) return;
    const dropData = e.over.data.current as { dayOfWeek: number };
    if (!dropData || dropData.dayOfWeek === current.dayOfWeek) return;
    setMoveModal({ task: current.task, targetDayOfWeek: dropData.dayOfWeek });
  }

  async function executeMoveOrDuplicate(action: "move" | "duplicate") {
    if (!moveModal || !week) return;
    await fetch("/api/rolling-tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: moveModal.task.id,
        action,
        targetWeekId: week.id,
        targetDayOfWeek: moveModal.targetDayOfWeek,
      }),
    });
    setMoveModal(null);
    await loadWeek(currentMonday);
  }

  // Mapear días por dayOfWeek para facilitar render
  const daysByDow: Record<number, Day | null> = {};
  for (let i = 1; i <= 5; i++) daysByDow[i] = null;
  if (week) {
    for (const d of week.days) daysByDow[d.dayOfWeek] = d;
  }

  const isCurrentWeek = currentMonday.getTime() === thisMonday.getTime();

  return (
    <main>
      <header className="mb-5">
        <Link href="/fisio/advance/rolling" className="text-xs text-neutral-500 hover:underline mb-2 inline-block">
          ← Volver a programas rolling
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              {program.name}
              {!program.isActive && (
                <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded" style={{ background: "#F5F5F5", color: "#737373" }}>
                  ARCHIVADO
                </span>
              )}
            </h1>
            {program.description && (
              <p className="text-sm text-neutral-500 mt-1">{program.description}</p>
            )}
            <div className="text-xs text-neutral-500 mt-2">
              {patients.length} {patients.length === 1 ? "paciente activo" : "pacientes activos"}
            </div>
          </div>
        </div>
      </header>

      {/* Navegación de semana */}
      <section className="mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <button
            onClick={() => setCurrentMonday(addDays(currentMonday, -7))}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}
          >
            ← Semana anterior
          </button>

          <div className="text-center flex-1 min-w-0">
            <div className="text-[11px] font-medium tracking-wider" style={{ color: "#737373" }}>
              {isCurrentWeek ? "⏰ ESTA SEMANA" : currentMonday < thisMonday ? "SEMANA PASADA" : "PRÓXIMA SEMANA"}
            </div>
            <div className="font-semibold text-base" style={{ letterSpacing: "-0.015em" }}>
              {formatWeekLabel(currentMonday.toISOString())}
            </div>
          </div>

          <button
            onClick={() => setCurrentMonday(addDays(currentMonday, 7))}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}
          >
            Semana siguiente →
          </button>
        </div>

        <div className="flex items-center justify-between text-xs">
          <button
            onClick={() => setCurrentMonday(thisMonday)}
            className="text-neutral-500 hover:underline"
          >
            Volver a hoy
          </button>
          {week && (
            <div className="flex items-center gap-3">
              {week.publishedAt ? (
                <span className="text-emerald-600 font-medium">● Publicada</span>
              ) : (
                <span className="text-amber-700 font-medium">● Borrador</span>
              )}
              <button onClick={togglePublish} className="text-neutral-700 hover:underline">
                {week.publishedAt ? "Despublicar" : "Publicar"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Contenido de la semana */}
      {loading ? (
        <p className="text-sm text-neutral-500 italic text-center py-10">Cargando...</p>
      ) : !week ? (
        <div className="text-center py-10">
          <p className="text-sm text-neutral-500 mb-4 italic">
            Esta semana aún no tiene contenido.
          </p>
          <button
            onClick={startThisWeek}
            className="text-sm font-medium px-4 py-2 rounded-lg"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            + Empezar a programar esta semana
          </button>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((dow) => {
              const day = daysByDow[dow];
              const tasks: Task[] = day?.tasks ?? [];
              return (
                <DroppableDayCell key={dow} dayOfWeek={dow} title={DAY_HEADERS[dow - 1]}>
                  {tasks.map((t) => (
                    <DraggableTask
                      key={t.id}
                      task={t}
                      dayOfWeek={dow}
                      onEdit={() => setEditTask(t)}
                      onDelete={() => deleteTask(t.id)}
                    />
                  ))}
                  <button
                    onClick={() => setTypeModal({ dayOfWeek: dow })}
                    className="text-xs text-neutral-400 border border-dashed border-neutral-300 rounded py-1.5 hover:bg-white hover:text-neutral-700 w-full"
                  >
                    + tarea
                  </button>
                </DroppableDayCell>
              );
            })}
          </div>

          <p className="text-xs text-neutral-500 italic text-center mt-4">
            💡 Arrastra tareas entre días para mover o duplicar
          </p>

          <DragOverlay>
            {dragging && (
              <div className={`text-xs rounded px-2 py-1.5 border shadow-md ${TYPE_COLORS[dragging.task.type] ?? "bg-neutral-100 border-neutral-200"}`}>
                <div className="font-medium truncate">{dragging.task.title}</div>
                <div className="text-[10px] opacity-70 mt-0.5">{TYPE_LABELS[dragging.task.type]}</div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Modales */}
      {typeModal && (
        <TaskTypeModal onSelect={addTaskOfType} onClose={() => setTypeModal(null)} />
      )}

      {editTask && (
        <TaskEditorModal
          task={editTask}
          onClose={() => {
            setEditTask(null);
            loadWeek(currentMonday);
          }}
        />
      )}

      {moveModal && (
        <MoveOrDuplicateModal
          targetDay={DAY_HEADERS[moveModal.targetDayOfWeek - 1]}
          taskTitle={moveModal.task.title}
          onClose={() => setMoveModal(null)}
          onMove={() => executeMoveOrDuplicate("move")}
          onDuplicate={() => executeMoveOrDuplicate("duplicate")}
        />
      )}
    </main>
  );
}

// =============================================================================
// Subcomponentes
// =============================================================================

function DroppableDayCell({
  dayOfWeek,
  title,
  children,
}: {
  dayOfWeek: number;
  title: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dayOfWeek}`,
    data: { dayOfWeek },
  });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg p-2 min-h-[180px] flex flex-col gap-1.5 ${
        isOver ? "bg-amber-50 border-amber-300" : "bg-neutral-50 border-neutral-200"
      } border`}
    >
      <div className="text-xs font-medium text-neutral-600 mb-1">{title}</div>
      {children}
    </div>
  );
}

function DraggableTask({
  task,
  dayOfWeek,
  onEdit,
  onDelete,
}: {
  task: Task;
  dayOfWeek: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { task, dayOfWeek },
  });
  if (isDragging) {
    return <div ref={setNodeRef} className="h-[42px] rounded border-2 border-dashed border-neutral-300" />;
  }
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`text-xs rounded px-2 py-1.5 border cursor-grab active:cursor-grabbing ${TYPE_COLORS[task.type] ?? "bg-neutral-100 border-neutral-200"}`}
    >
      <div className="flex justify-between items-start gap-1.5 mb-0.5">
        <div className="font-medium truncate flex-1">{task.title}</div>
        <div className="flex gap-0.5">
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="opacity-60 hover:opacity-100">✎</button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      </div>
      <div className="text-[10px] opacity-70">{TYPE_LABELS[task.type]}</div>
    </div>
  );
}

function TaskTypeModal({ onSelect, onClose }: { onSelect: (t: string) => void; onClose: () => void }) {
  const types = [
    { type: "WORKOUT", label: "Workout", icon: "💪", desc: "Sesión de entrenamiento" },
    { type: "VIDEO", label: "Vídeo", icon: "🎥", desc: "YouTube o enlace externo" },
    { type: "FORM", label: "Formulario", icon: "📝", desc: "Cuestionario de Biblioteca" },
    { type: "EVOLUTION", label: "Evolución", icon: "📊", desc: "Pedir métricas al paciente" },
  ];
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1">Tipo de tarea</h3>
        <p className="text-xs text-neutral-500 mb-4">¿Qué quieres añadir a este día?</p>
        <div className="grid grid-cols-2 gap-2">
          {types.map((t) => (
            <button
              key={t.type}
              onClick={() => onSelect(t.type)}
              className="text-left p-3 rounded-lg hover:bg-neutral-50"
              style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}
            >
              <div className="text-xl mb-1">{t.icon}</div>
              <div className="font-medium text-sm">{t.label}</div>
              <div className="text-[10px] text-neutral-500 mt-0.5">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TaskEditorModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [bodyText, setBodyText] = useState(task.bodyText || "");
  const [videoId, setVideoId] = useState(task.videoId || "");
  const [saving, setSaving] = useState(false);

  // Lista de vídeos de la Biblioteca (cargado al abrir si es tipo VIDEO)
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [creatingVideo, setCreatingVideo] = useState(false);

  useEffect(() => {
    // Cargamos la lista de vídeos para VIDEO y WORKOUT (en WORKOUT es opcional como apoyo)
    if (task.type !== "VIDEO" && task.type !== "WORKOUT") return;
    setLoadingVideos(true);
    fetch("/api/library/videos")
      .then((r) => r.json())
      .then((data) => {
        setVideos(data);
        setLoadingVideos(false);
      })
      .catch(() => setLoadingVideos(false));
  }, [task.type]);

  async function save() {
    setSaving(true);
    await fetch("/api/rolling-tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: task.id,
        title,
        bodyText: task.type === "WORKOUT" || task.type === "VIDEO" ? bodyText : undefined,
        videoId: (task.type === "VIDEO" || task.type === "WORKOUT") ? (videoId || null) : undefined,
      }),
    });
    setSaving(false);
    onClose();
  }

  async function handleVideoCreated(newVideo: LibraryVideo) {
    setVideos((prev) => [...prev, newVideo]);
    setVideoId(newVideo.id);
    setCreatingVideo(false);
    // Si el título de la tarea es el default, lo sustituimos por el del vídeo
    if (title === "Nuevo vídeo" || !title.trim()) {
      setTitle(newVideo.title);
    }
  }

  const selectedVideo = videos.find((v) => v.id === videoId);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">{TYPE_LABELS[task.type]}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Título</label>
            <input
              type="text"
              className="input text-sm w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {task.type === "WORKOUT" && (
            <>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Contenido del workout</label>
                <textarea
                  className="input text-sm w-full font-mono"
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  rows={12}
                  placeholder={"Ejemplo:\n\nA. Sentadilla 5x5 @ 80%\nB. Press banca 4x6\nC. Metcon\n  21-15-9:\n  - Thrusters @ 42.5kg\n  - Pull-ups"}
                />
              </div>
              <div>
                <div className="flex items-end justify-between mb-1 gap-2">
                  <label className="text-xs text-neutral-500">Vídeo de apoyo (opcional)</label>
                  <button
                    type="button"
                    onClick={() => setCreatingVideo(true)}
                    className="text-[11px] font-medium hover:underline"
                    style={{ color: "#0A0A0A" }}
                  >
                    + Subir nuevo a Biblioteca
                  </button>
                </div>
                {loadingVideos ? (
                  <p className="text-xs text-neutral-500 italic">Cargando vídeos...</p>
                ) : videos.length === 0 ? (
                  <select className="input text-sm w-full" value="" disabled>
                    <option>— No hay vídeos en Biblioteca todavía —</option>
                  </select>
                ) : (
                  <select
                    className="input text-sm w-full"
                    value={videoId}
                    onChange={(e) => setVideoId(e.target.value)}
                  >
                    <option value="">— Sin vídeo —</option>
                    {videos.map((v) => (
                      <option key={v.id} value={v.id}>
                        [{v.category}] {v.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </>
          )}

          {task.type === "VIDEO" && (
            <>
              <div>
                <div className="flex items-end justify-between mb-1 gap-2">
                  <label className="text-xs text-neutral-500">Vídeo de la Biblioteca *</label>
                  <button
                    type="button"
                    onClick={() => setCreatingVideo(true)}
                    className="text-[11px] font-medium hover:underline"
                    style={{ color: "#0A0A0A" }}
                  >
                    + Subir nuevo a Biblioteca
                  </button>
                </div>
                {loadingVideos ? (
                  <p className="text-xs text-neutral-500 italic">Cargando vídeos...</p>
                ) : videos.length === 0 ? (
                  <div className="text-xs p-3 rounded-lg" style={{ background: "#FEF3C7", color: "#7C2D12" }}>
                    No hay vídeos en Biblioteca todavía. Pulsa "+ Subir nuevo" para añadir uno.
                  </div>
                ) : (
                  <select
                    className="input text-sm w-full"
                    value={videoId}
                    onChange={(e) => setVideoId(e.target.value)}
                  >
                    <option value="">— Selecciona un vídeo —</option>
                    {videos.map((v) => (
                      <option key={v.id} value={v.id}>
                        [{v.category}] {v.title}
                      </option>
                    ))}
                  </select>
                )}
                {selectedVideo && (
                  <a
                    href={selectedVideo.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-1 text-[11px] text-neutral-500 hover:underline"
                  >
                    Ver vídeo en YouTube →
                  </a>
                )}
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Notas (opcional)</label>
                <textarea
                  className="input text-sm w-full"
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  rows={3}
                  placeholder="Contexto o instrucciones para el vídeo..."
                />
              </div>
            </>
          )}

          {task.type === "FORM" && (
            <p className="text-xs text-neutral-500 italic">
              La selección del formulario se hace desde la Biblioteca. Esta funcionalidad aún no está conectada para Rolling.
            </p>
          )}

          {task.type === "EVOLUTION" && (
            <p className="text-xs text-neutral-500 italic">
              Al llegar a esta tarea, el paciente registrará su evolución del día (humor, sueño, dolor, etc).
            </p>
          )}

          <button
            onClick={save}
            disabled={saving}
            className="w-full text-sm font-medium mt-2"
            style={{
              background: "#0A0A0A",
              color: "#FAFAFA",
              padding: 11,
              borderRadius: 10,
              border: "none",
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      {creatingVideo && (
        <QuickCreateVideoModal
          onClose={() => setCreatingVideo(false)}
          onCreated={handleVideoCreated}
        />
      )}
    </div>
  );
}

function QuickCreateVideoModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (v: LibraryVideo) => void;
}) {
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Educacional");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (!title.trim() || !youtubeUrl.trim()) {
      setError("Título y URL son obligatorios");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/library/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        youtubeUrl: youtubeUrl.trim(),
        description: description.trim() || null,
        category,
      }),
    });
    if (res.ok) {
      const v = await res.json();
      onCreated({ id: v.id, title: v.title, youtubeUrl: v.youtubeUrl, category: v.category });
    } else {
      setError("No se pudo guardar");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">+ Vídeo a Biblioteca</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Se guardará en Biblioteca → Vídeos y quedará seleccionado para esta tarea.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Título *</label>
            <input
              type="text"
              autoFocus
              className="input text-sm w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Movilidad torácica - rotaciones"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">URL de YouTube *</label>
            <input
              type="url"
              className="input text-sm w-full"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Categoría</label>
            <select
              className="input text-sm w-full"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option>Educacional</option>
              <option>Anatomía</option>
              <option>Técnica</option>
              <option>Movilidad</option>
              <option>Fuerza</option>
              <option>Cardio</option>
              <option>Otros</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Descripción (opcional)</label>
            <textarea
              className="input text-sm w-full"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={save}
            disabled={saving || !title.trim() || !youtubeUrl.trim()}
            className="w-full text-sm font-medium"
            style={{
              background: "#0A0A0A",
              color: "#FAFAFA",
              padding: 11,
              borderRadius: 10,
              border: "none",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Guardando..." : "Guardar en Biblioteca"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MoveOrDuplicateModal({
  targetDay,
  taskTitle,
  onClose,
  onMove,
  onDuplicate,
}: {
  targetDay: string;
  taskTitle: string;
  onClose: () => void;
  onMove: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1">"{taskTitle}" → {targetDay}</h3>
        <p className="text-xs text-neutral-500 mb-4">¿Qué quieres hacer?</p>
        <div className="space-y-2">
          <button
            onClick={onMove}
            className="w-full text-sm font-medium px-3 py-3 rounded-lg"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            Mover
          </button>
          <button
            onClick={onDuplicate}
            className="w-full text-sm font-medium px-3 py-3 rounded-lg"
            style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}
          >
            Duplicar
          </button>
          <button onClick={onClose} className="w-full text-xs text-neutral-500 py-2 hover:underline">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
