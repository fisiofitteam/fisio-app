"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PRIORITY_LABELS,
  PRIORITY_COLOR,
  PRIORITY_ORDER,
  RECURRENCE_LABELS,
  type CeoTaskPriority,
  type CeoRecurrence,
} from "@/lib/ceo-personal";

type Tag = { id: string; name: string; color: string };

type SubtaskItem = {
  id: string;
  title: string;
  completedAt: string | null;
};

type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  priority: CeoTaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  recurrenceType: CeoRecurrence;
  recurrenceDay: number | null;
  subtasks: SubtaskItem[];
  tags: Tag[];
};

const DEFAULT_TAG_COLORS = [
  "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899",
  "#EF4444", "#0EA5E9", "#84CC16", "#F97316", "#6366F1",
];

const DAY_NAMES = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function todayYmd(): string { return ymd(new Date()); }
function endOfWeekYmd(d: Date = new Date()): string {
  const c = new Date(d);
  const dow = c.getDay() === 0 ? 7 : c.getDay(); // 1..7
  c.setDate(c.getDate() + (7 - dow));
  return ymd(c);
}
function endOfMonthYmd(d: Date = new Date()): string {
  const c = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return ymd(c);
}

function classifyDueDate(due: string | null): "overdue" | "today" | "week" | "month" | "later" | "noDate" {
  if (!due) return "noDate";
  const dueYmd = due.slice(0, 10);
  const t = todayYmd();
  if (dueYmd < t) return "overdue";
  if (dueYmd === t) return "today";
  if (dueYmd <= endOfWeekYmd()) return "week";
  if (dueYmd <= endOfMonthYmd()) return "month";
  return "later";
}

export function CeoPersonalView({ userFullName }: { userFullName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<TaskItem[]>([]);
  const [recentlyDone, setRecentlyDone] = useState<TaskItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [focusContent, setFocusContent] = useState("");
  const [focusYear, setFocusYear] = useState(new Date().getFullYear());
  const [focusMonth, setFocusMonth] = useState(new Date().getMonth() + 1);
  const [loaded, setLoaded] = useState(false);

  const loadAll = useCallback(async () => {
    const [tRes, tagRes, fRes] = await Promise.all([
      fetch("/api/ceo/tasks", { cache: "no-store" }),
      fetch("/api/ceo/tags", { cache: "no-store" }),
      fetch("/api/ceo/focus", { cache: "no-store" }),
    ]);
    if (tRes.ok) {
      const data = await tRes.json();
      setPending(normalizeTasks(data.pending));
      setRecentlyDone(normalizeTasks(data.recentlyDone));
    }
    if (tagRes.ok) {
      const data = await tagRes.json();
      setTags(data.tags ?? []);
    }
    if (fRes.ok) {
      const data = await fRes.json();
      setFocusContent(data.focus?.content ?? "");
      setFocusYear(data.year);
      setFocusMonth(data.month);
    }
    setLoaded(true);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Bloque foco del mes ───
  const focusDebouncer = useRef<NodeJS.Timeout | null>(null);
  function onFocusChange(v: string) {
    setFocusContent(v);
    if (focusDebouncer.current) clearTimeout(focusDebouncer.current);
    focusDebouncer.current = setTimeout(async () => {
      await fetch("/api/ceo/focus", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: focusYear, month: focusMonth, content: v }),
      });
    }, 1000);
  }
  useEffect(() => () => { if (focusDebouncer.current) clearTimeout(focusDebouncer.current); }, []);

  // ─── Tareas: helpers ───
  async function toggleComplete(t: TaskItem) {
    const completedAt = t.completedAt ? null : new Date().toISOString();
    await fetch("/api/ceo/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, completedAt }),
    });
    loadAll();
  }

  async function deleteTask(id: string) {
    if (!confirm("¿Eliminar esta tarea?")) return;
    await fetch(`/api/ceo/tasks?id=${id}`, { method: "DELETE" });
    loadAll();
  }

  // ─── Filtros de tareas ───
  const [filterPriorities, setFilterPriorities] = useState<CeoTaskPriority[]>([]);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);

  function togglePriority(p: CeoTaskPriority) {
    setFilterPriorities((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }
  function toggleTagFilter(id: string) {
    setFilterTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function clearFilters() {
    setFilterPriorities([]);
    setFilterTagIds([]);
  }
  const anyFilterActive = filterPriorities.length > 0 || filterTagIds.length > 0;

  const filteredPending = useMemo(() => {
    return pending.filter((t) => {
      if (filterPriorities.length > 0 && !filterPriorities.includes(t.priority)) return false;
      if (filterTagIds.length > 0) {
        const taskTagIds = new Set(t.tags.map((tg) => tg.id));
        if (!filterTagIds.some((id) => taskTagIds.has(id))) return false;
      }
      return true;
    });
  }, [pending, filterPriorities, filterTagIds]);

  // ─── Agrupación de pendientes (filtradas) por fecha ───
  type Group = "overdue" | "today" | "week" | "month" | "later" | "noDate";
  const grouped = useMemo(() => {
    const result: Record<Group, TaskItem[]> = {
      overdue: [], today: [], week: [], month: [], later: [], noDate: [],
    };
    for (const t of filteredPending) {
      result[classifyDueDate(t.dueDate)].push(t);
    }
    // Dentro de cada grupo: prioridad > fecha asc > orden creación
    for (const k of Object.keys(result) as Group[]) {
      result[k].sort((a, b) => {
        const pa = PRIORITY_ORDER.indexOf(a.priority);
        const pb = PRIORITY_ORDER.indexOf(b.priority);
        if (pa !== pb) return pa - pb;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
    }
    return result;
  }, [filteredPending]);

  // Modales
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showTagsManager, setShowTagsManager] = useState(false);

  return (
    <div className="space-y-4">
      {/* 1. Foco del mes */}
      <FocusBlock
        year={focusYear}
        month={focusMonth}
        content={focusContent}
        onChange={onFocusChange}
      />

      {/* 2 + 3. Tareas (izquierda) + Agenda del día (derecha) al mismo nivel, simétricos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

      <section className="card">
        <header className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div>
            <h2 className="font-medium text-sm">✅ Mis tareas</h2>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Privadas, agrupadas por fecha. {pending.length} pendiente{pending.length !== 1 && "s"}
              {anyFilterActive && <span> · {filteredPending.length} tras filtros</span>}.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowTagsManager(true)} className="btn btn-ghost text-xs">
              🏷️ Etiquetas
            </button>
            <button onClick={() => setShowNewTask(true)} className="btn btn-primary text-xs">
              + Nueva tarea
            </button>
          </div>
        </header>

        {/* Chips de filtro: prioridad + etiquetas */}
        {(pending.length > 0 || tags.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mb-3 items-center">
            <span className="text-[10px] uppercase tracking-wide text-neutral-400 mr-1">Filtrar:</span>
            {PRIORITY_ORDER.map((p) => {
              const active = filterPriorities.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePriority(p)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border ${
                    active ? PRIORITY_COLOR[p] + " border-current" : "bg-white border-neutral-200 text-neutral-500"
                  }`}
                >
                  {active && "✓ "}{PRIORITY_LABELS[p]}
                </button>
              );
            })}
            {tags.length > 0 && <span className="text-neutral-300">·</span>}
            {tags.map((tg) => {
              const active = filterTagIds.includes(tg.id);
              return (
                <button
                  key={tg.id}
                  onClick={() => toggleTagFilter(tg.id)}
                  className="text-[11px] px-2 py-0.5 rounded-full border"
                  style={{
                    background: active ? tg.color : "white",
                    borderColor: tg.color,
                    color: active ? "white" : tg.color,
                  }}
                >
                  {active && "✓ "}{tg.name}
                </button>
              );
            })}
            {anyFilterActive && (
              <button
                onClick={clearFilters}
                className="text-[11px] text-neutral-500 underline ml-1"
              >
                limpiar
              </button>
            )}
          </div>
        )}

        {!loaded ? (
          <p className="text-xs text-neutral-400 italic text-center py-6">Cargando…</p>
        ) : pending.length === 0 ? (
          <p className="text-xs text-neutral-400 italic text-center py-8">
            🎉 Sin tareas pendientes. Pulsa + Nueva tarea para añadir.
          </p>
        ) : filteredPending.length === 0 ? (
          <p className="text-xs text-neutral-400 italic text-center py-8">
            Sin tareas que coincidan con los filtros activos.
          </p>
        ) : (
          <div className="space-y-3">
            {grouped.overdue.length > 0 && (
              <TaskSection
                title="🔥 Atrasadas"
                titleColor="text-red-700"
                tasks={grouped.overdue}
                onToggle={toggleComplete}
                onEdit={setEditingTask}
                onDelete={deleteTask}
              />
            )}
            {grouped.today.length > 0 && (
              <TaskSection
                title="📌 Hoy"
                titleColor="text-amber-800"
                tasks={grouped.today}
                onToggle={toggleComplete}
                onEdit={setEditingTask}
                onDelete={deleteTask}
              />
            )}
            {grouped.week.length > 0 && (
              <TaskSection
                title="🗓️ Esta semana"
                titleColor="text-blue-700"
                tasks={grouped.week}
                onToggle={toggleComplete}
                onEdit={setEditingTask}
                onDelete={deleteTask}
              />
            )}
            {grouped.month.length > 0 && (
              <TaskSection
                title="📆 Este mes"
                titleColor="text-purple-700"
                tasks={grouped.month}
                onToggle={toggleComplete}
                onEdit={setEditingTask}
                onDelete={deleteTask}
              />
            )}
            {grouped.later.length > 0 && (
              <TaskSection
                title="⏳ Más adelante"
                titleColor="text-neutral-600"
                tasks={grouped.later}
                onToggle={toggleComplete}
                onEdit={setEditingTask}
                onDelete={deleteTask}
              />
            )}
            {grouped.noDate.length > 0 && (
              <TaskSection
                title="📋 Sin fecha"
                titleColor="text-neutral-500"
                tasks={grouped.noDate}
                onToggle={toggleComplete}
                onEdit={setEditingTask}
                onDelete={deleteTask}
              />
            )}
          </div>
        )}

        {recentlyDone.length > 0 && (
          <div className="mt-4 pt-3 border-t border-neutral-100">
            <h3 className="text-[11px] uppercase tracking-wide text-neutral-400 mb-2">
              ✓ Hechas recientemente
            </h3>
            <div className="space-y-1 opacity-60">
              {recentlyDone.slice(0, 5).map((t) => (
                <TaskRow key={t.id} task={t} onToggle={toggleComplete} onEdit={setEditingTask} onDelete={deleteTask} />
              ))}
            </div>
          </div>
        )}
      </section>

      <AgendaBlock importantSource={pending} />

      </div>

      {/* 4. Notas persistentes */}
      <NotesBlock />

      {(showNewTask || editingTask) && (
        <TaskModal
          task={editingTask}
          tags={tags}
          onClose={() => { setShowNewTask(false); setEditingTask(null); }}
          onSaved={() => { setShowNewTask(false); setEditingTask(null); loadAll(); }}
        />
      )}
      {showTagsManager && (
        <TagsModal
          tags={tags}
          onClose={() => setShowTagsManager(false)}
          onChange={() => { loadAll(); }}
        />
      )}
    </div>
  );
}

function normalizeTasks(raw: any[]): TaskItem[] {
  return (raw ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    priority: (r.priority ?? "medium") as CeoTaskPriority,
    dueDate: r.dueDate ?? null,
    completedAt: r.completedAt ?? null,
    recurrenceType: (r.recurrenceType ?? "none") as CeoRecurrence,
    recurrenceDay: r.recurrenceDay ?? null,
    subtasks: (r.subtasks ?? []).map((s: any) => ({
      id: s.id, title: s.title, completedAt: s.completedAt ?? null,
    })),
    tags: (r.tags ?? []).map((t: any) => t.tag as Tag).filter(Boolean),
  }));
}

function FocusBlock({
  year, month, content, onChange,
}: {
  year: number; month: number; content: string; onChange: (v: string) => void;
}) {
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return (
    <section className="card border-amber-200 bg-amber-50/40">
      <header className="mb-2">
        <h2 className="font-medium text-sm">🎯 Foco de {monthLabel}</h2>
        <p className="text-[11px] text-neutral-500 mt-0.5">
          A qué le estás dando prioridad este mes. 1-3 frases. Se autoguarda.
        </p>
      </header>
      <textarea
        className="input"
        rows={3}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ej.: Subir 10k seguidores en IG. Cerrar el equipo de fisios. Dejar lista la campaña ads Q3."
      />
    </section>
  );
}

function NotesBlock() {
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const debouncer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/ceo/notes", { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setContent(data.content ?? "");
      }
      setLoaded(true);
    })();
  }, []);

  function onChange(v: string) {
    setContent(v);
    if (debouncer.current) clearTimeout(debouncer.current);
    debouncer.current = setTimeout(async () => {
      const r = await fetch("/api/ceo/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: v }),
      });
      if (r.ok) setSavedAt(new Date());
    }, 1000);
  }
  useEffect(() => () => { if (debouncer.current) clearTimeout(debouncer.current); }, []);

  return (
    <section className="card">
      <header className="flex justify-between items-center mb-2 flex-wrap gap-2">
        <div>
          <h2 className="font-medium text-sm">📝 Notas</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Tu bloc personal siempre visible. Apunta, borra y reescribe libremente.
          </p>
        </div>
        {savedAt && (
          <span className="text-[10px] text-neutral-400">Guardado · {savedAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
        )}
      </header>
      <textarea
        className="input"
        rows={8}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder={loaded ? "Lo que quieras tener delante: ideas sueltas, recordatorios, anotaciones del día…" : "Cargando…"}
      />
    </section>
  );
}

/**
 * AgendaBlock — agenda rápida del día.
 * - 3 slots ⌖ "importantes": auto-rellenan con tareas (CeoTask) cuyo dueDate=hoy.
 * - 7 slots normales: editables inline, persisten como CeoQuickAgendaItem (today).
 */
function AgendaBlock({ importantSource }: { importantSource: TaskItem[] }) {
  const [items, setItems] = useState<Array<{ id: string; content: string; completedAt: string | null; order: number }>>([]);
  const [drafts, setDrafts] = useState<string[]>(Array(7).fill(""));
  const [loaded, setLoaded] = useState(false);

  // Importantes: tareas con dueDate = hoy (clasificación reusada del componente)
  const todayYmdStr = todayYmd();
  const important = useMemo(() => {
    return importantSource
      .filter((t) => t.dueDate?.slice(0, 10) === todayYmdStr)
      .slice(0, 3);
  }, [importantSource, todayYmdStr]);

  const loadItems = useCallback(async () => {
    const r = await fetch("/api/ceo/agenda", { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      const ordered = (data.items ?? []).slice().sort((a: any, b: any) => a.order - b.order);
      setItems(ordered);
    }
    setLoaded(true);
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Sincroniza drafts con items existentes
  useEffect(() => {
    const next = Array(7).fill("");
    items.slice(0, 7).forEach((it, i) => { next[i] = it.content; });
    setDrafts(next);
  }, [items]);

  async function saveSlot(index: number, value: string) {
    const trimmed = value.trim();
    const existing = items[index];
    if (existing) {
      if (trimmed === existing.content) return;
      if (!trimmed) {
        await fetch(`/api/ceo/agenda?id=${existing.id}`, { method: "DELETE" });
      } else {
        await fetch("/api/ceo/agenda", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: existing.id, content: trimmed }),
        });
      }
    } else if (trimmed) {
      await fetch("/api/ceo/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed, order: index }),
      });
    }
    loadItems();
  }

  async function toggleDone(index: number) {
    const it = items[index];
    if (!it) return;
    await fetch("/api/ceo/agenda", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: it.id, completedAt: it.completedAt ? null : new Date().toISOString() }),
    });
    loadItems();
  }

  function updateDraft(i: number, v: string) {
    setDrafts((prev) => { const n = [...prev]; n[i] = v; return n; });
  }

  return (
    <section className="card">
      <header className="mb-2">
        <h2 className="font-medium text-sm">📌 Agenda del día</h2>
        <p className="text-[11px] text-neutral-500 mt-0.5">
          3 dianas (auto, tareas de hoy) + 7 rápidas escribibles.
        </p>
      </header>

      {/* Importantes */}
      <div className="space-y-1.5 mb-3">
        {[0, 1, 2].map((i) => {
          const t = important[i];
          return (
            <div key={`imp-${i}`} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5">🎯</span>
              {t ? (
                <span className="flex-1 leading-snug">
                  <span className={`${PRIORITY_COLOR[t.priority]} text-[10px] font-medium uppercase mr-1`}>
                    {PRIORITY_LABELS[t.priority]}
                  </span>
                  {t.title}
                </span>
              ) : (
                <span className="flex-1 text-neutral-300 italic">Sin tarea importante para hoy</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-neutral-100 pt-2">
        <h3 className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1.5">Cosas rápidas</h3>
        <div className="space-y-1">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const it = items[i];
            const done = !!it?.completedAt;
            return (
              <div key={`quick-${i}`} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => it && toggleDone(i)}
                  disabled={!it}
                  className={`w-3.5 h-3.5 rounded border flex-shrink-0 ${done ? "bg-neutral-900 border-neutral-900" : "border-neutral-300"} ${it ? "cursor-pointer" : "cursor-default opacity-40"}`}
                  title={it ? (done ? "Marcar como pendiente" : "Marcar como hecha") : ""}
                >
                  {done && <span className="block text-white text-[9px] leading-none -mt-0.5">✓</span>}
                </button>
                <input
                  type="text"
                  className={`flex-1 text-xs border-0 border-b border-neutral-100 focus:border-neutral-400 outline-none bg-transparent py-1 ${done ? "line-through text-neutral-400" : ""}`}
                  value={drafts[i] ?? ""}
                  onChange={(e) => updateDraft(i, e.target.value)}
                  onBlur={(e) => saveSlot(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder={loaded ? `· línea ${i + 1}` : ""}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TaskSection({
  title, titleColor, tasks, onToggle, onEdit, onDelete,
}: {
  title: string; titleColor: string; tasks: TaskItem[];
  onToggle: (t: TaskItem) => void;
  onEdit: (t: TaskItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <h3 className={`text-[11px] uppercase tracking-wide font-medium mb-1.5 ${titleColor}`}>{title}</h3>
      <div className="space-y-1">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({
  task, onToggle, onEdit, onDelete,
}: {
  task: TaskItem;
  onToggle: (t: TaskItem) => void;
  onEdit: (t: TaskItem) => void;
  onDelete: (id: string) => void;
}) {
  const completed = !!task.completedAt;
  const subtotal = task.subtasks.length;
  const subdone = task.subtasks.filter((s) => s.completedAt).length;

  return (
    <div className="flex items-start gap-2 p-2 rounded hover:bg-neutral-50 group">
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(task); }}
        className="mt-0.5 flex-shrink-0 text-base leading-none"
        aria-label={completed ? "Desmarcar" : "Completar"}
      >
        {completed ? "☑" : "☐"}
      </button>
      <button onClick={() => onEdit(task)} className="flex-1 min-w-0 text-left">
        <div className={`text-sm font-medium ${completed ? "line-through text-neutral-400" : ""}`}>
          {task.title}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${PRIORITY_COLOR[task.priority]}`}>
            {PRIORITY_LABELS[task.priority]}
          </span>
          {task.dueDate && (
            <span className="text-[10px] text-neutral-500">
              {new Date(task.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
            </span>
          )}
          {task.recurrenceType !== "none" && (
            <span className="text-[10px] text-blue-700">🔁 {RECURRENCE_LABELS[task.recurrenceType]}</span>
          )}
          {subtotal > 0 && (
            <span className="text-[10px] text-neutral-500">📋 {subdone}/{subtotal}</span>
          )}
          {task.tags.map((tg) => (
            <span key={tg.id} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: tg.color + "33", color: tg.color }}>
              {tg.name}
            </span>
          ))}
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
        className="opacity-0 group-hover:opacity-100 text-xs text-red-600 px-1"
        aria-label="Borrar"
      >
        ✕
      </button>
    </div>
  );
}

function TaskModal({
  task, tags, onClose, onSaved,
}: {
  task: TaskItem | null;
  tags: Tag[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!task;
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<CeoTaskPriority>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(task?.dueDate ? task.dueDate.slice(0, 10) : "");
  const [recurrenceType, setRecurrenceType] = useState<CeoRecurrence>(task?.recurrenceType ?? "none");
  const [recurrenceDay, setRecurrenceDay] = useState<number | "">(task?.recurrenceDay ?? "");
  const [tagIds, setTagIds] = useState<string[]>(task?.tags.map((t) => t.id) ?? []);
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>(task?.subtasks ?? []);
  const [newSubtask, setNewSubtask] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleTag(id: string) {
    setTagIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const payload = {
      ...(isEdit && { id: task!.id }),
      title, description, priority,
      dueDate: dueDate || null,
      recurrenceType,
      recurrenceDay: (recurrenceType === "weekly" || recurrenceType === "monthly") && recurrenceDay !== "" ? Number(recurrenceDay) : null,
      tagIds,
    };
    const res = await fetch("/api/ceo/tasks", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? "No se pudo guardar");
      setSaving(false);
      return;
    }
    onSaved();
  }

  // ─── Subtareas: solo al editar (necesitamos task.id) ───
  async function addSubtask() {
    if (!isEdit || !newSubtask.trim()) return;
    const res = await fetch("/api/ceo/subtasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task!.id, title: newSubtask.trim() }),
    });
    if (res.ok) {
      const { id } = await res.json();
      setSubtasks((prev) => [...prev, { id, title: newSubtask.trim(), completedAt: null }]);
      setNewSubtask("");
    }
  }
  async function toggleSubtask(s: SubtaskItem) {
    const completedAt = s.completedAt ? null : new Date().toISOString();
    await fetch("/api/ceo/subtasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, completedAt }),
    });
    setSubtasks((prev) => prev.map((x) => (x.id === s.id ? { ...x, completedAt } : x)));
  }
  async function deleteSubtask(id: string) {
    await fetch(`/api/ceo/subtasks?id=${id}`, { method: "DELETE" });
    setSubtasks((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium">{isEdit ? "Editar tarea" : "Nueva tarea"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Título</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Descripción (opcional)</label>
            <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Prioridad</label>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as CeoTaskPriority)}>
                {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Fecha objetivo</label>
              <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">🔁 Recurrencia</label>
            <select className="input" value={recurrenceType} onChange={(e) => setRecurrenceType(e.target.value as CeoRecurrence)}>
              {(["none", "daily", "weekly", "monthly"] as CeoRecurrence[]).map((r) => (
                <option key={r} value={r}>{RECURRENCE_LABELS[r]}</option>
              ))}
            </select>
            {recurrenceType === "weekly" && (
              <div className="mt-2 flex gap-1">
                {DAY_NAMES.slice(1).map((lbl, i) => {
                  const n = i + 1;
                  const active = recurrenceDay === n;
                  return (
                    <button key={n} onClick={() => setRecurrenceDay(n)} className={`flex-1 text-xs py-1.5 rounded ${active ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}>
                      {lbl}
                    </button>
                  );
                })}
              </div>
            )}
            {recurrenceType === "monthly" && (
              <div className="mt-2">
                <label className="text-xs text-neutral-500 block mb-1">Día del mes (1-31)</label>
                <input type="number" className="input" min={1} max={31} value={recurrenceDay} onChange={(e) => setRecurrenceDay(e.target.value ? Number(e.target.value) : "")} />
              </div>
            )}
            {recurrenceType !== "none" && (
              <p className="text-[11px] text-neutral-400 mt-1 italic">
                Al completar la tarea, se crea una copia automáticamente con la siguiente fecha.
              </p>
            )}
          </div>

          {tags.length > 0 && (
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Etiquetas</label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const active = tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className="text-xs px-2 py-1 rounded-full border transition"
                      style={{
                        background: active ? t.color : "white",
                        borderColor: t.color,
                        color: active ? "white" : t.color,
                      }}
                    >
                      {active && "✓ "}{t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isEdit && (
            <div className="border-t border-neutral-100 pt-3">
              <label className="text-xs text-neutral-500 block mb-2">📋 Subtareas</label>
              <div className="space-y-1 mb-2">
                {subtasks.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 group">
                    <button onClick={() => toggleSubtask(s)} className="text-base leading-none">
                      {s.completedAt ? "☑" : "☐"}
                    </button>
                    <span className={`text-sm flex-1 ${s.completedAt ? "line-through text-neutral-400" : ""}`}>{s.title}</span>
                    <button onClick={() => deleteSubtask(s.id)} className="text-xs text-red-600 opacity-0 group-hover:opacity-100">✕</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="input text-sm flex-1"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSubtask()}
                  placeholder="Añadir subtarea (Enter)"
                />
                <button onClick={addSubtask} className="btn btn-ghost text-xs">+</button>
              </div>
            </div>
          )}

          <button onClick={save} disabled={!title.trim() || saving} className="btn btn-primary w-full">
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear tarea"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TagsModal({ tags, onClose, onChange }: { tags: Tag[]; onClose: () => void; onChange: () => void }) {
  const [list, setList] = useState<Tag[]>(tags);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_TAG_COLORS[0]);

  useEffect(() => { setList(tags); }, [tags]);

  async function addTag() {
    if (!newName.trim()) return;
    const r = await fetch("/api/ceo/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    if (r.ok) {
      setNewName("");
      onChange();
    }
  }

  async function deleteTag(id: string) {
    if (!confirm("¿Eliminar etiqueta? Se quitará de todas las tareas.")) return;
    await fetch(`/api/ceo/tags?id=${id}`, { method: "DELETE" });
    onChange();
  }

  async function updateColor(id: string, color: string) {
    await fetch("/api/ceo/tags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, color }),
    });
    onChange();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium">🏷️ Mis etiquetas</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>

        <div className="space-y-2 mb-3">
          {list.length === 0 && (
            <p className="text-xs text-neutral-400 italic text-center py-2">Aún no tienes etiquetas.</p>
          )}
          {list.map((t) => (
            <div key={t.id} className="flex items-center gap-2 group">
              <span className="text-sm flex-1 font-medium" style={{ color: t.color }}>● {t.name}</span>
              <div className="flex gap-1">
                {DEFAULT_TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => updateColor(t.id, c)}
                    className={`w-4 h-4 rounded-full ${t.color === c ? "ring-2 ring-neutral-900" : ""}`}
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>
              <button onClick={() => deleteTag(t.id)} className="text-xs text-red-600 opacity-0 group-hover:opacity-100">✕</button>
            </div>
          ))}
        </div>

        <div className="border-t border-neutral-100 pt-3">
          <label className="text-xs text-neutral-500 block mb-1">Nueva etiqueta</label>
          <div className="flex gap-2">
            <input
              className="input text-sm flex-1"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
              placeholder="Nombre (Negocio, Personal…)"
            />
            <button onClick={addTag} className="btn btn-primary text-xs">+ Crear</button>
          </div>
          <div className="flex gap-1 mt-2">
            {DEFAULT_TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full ${newColor === c ? "ring-2 ring-neutral-900" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
