"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COMMUNITY_CATEGORIES, categoryMeta } from "@/lib/community";

type Post = { id: string; date: string; category: string; assignedToId: string | null; text: string | null; done: boolean };
type Idea = { id: string; categories: string[]; text: string };
type TeamMember = { id: string; fullName: string };

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function CommunityView({
  initialYear,
  initialMonth,
  team,
  initialPosts,
  initialIdeas,
}: {
  initialYear: number;
  initialMonth: number;
  team: TeamMember[];
  initialPosts: Post[];
  initialIdeas: Idea[];
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth); // 0-11
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [ideas, setIdeas] = useState<Idea[]>(initialIdeas);
  const [loading, setLoading] = useState(false);

  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [newPostDate, setNewPostDate] = useState<string | null>(null);
  const [newIdea, setNewIdea] = useState(false);
  const [programming, setProgramming] = useState<Idea | null>(null);
  const [ideaFilter, setIdeaFilter] = useState<string>("todas");

  const teamMap = useMemo(() => Object.fromEntries(team.map((t) => [t.id, t.fullName])), [team]);

  // Recarga posts al cambiar de mes (salta el primer render: ya vienen del server)
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const from = dayKey(year, month, 1);
    const to = `${month === 11 ? year + 1 : year}-${pad(month === 11 ? 1 : month + 2)}-01`;
    setLoading(true);
    fetch(`/api/community/posts?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((data) => setPosts(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [year, month]);

  const postsByDay = useMemo(() => {
    const map: Record<string, Post> = {};
    for (const p of posts) map[p.date.slice(0, 10)] = p;
    return map;
  }, [posts]);

  // Construcción de la rejilla del mes
  const firstDow = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // 0=Lun
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  const todayKey = (() => {
    const n = new Date();
    return dayKey(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  })();

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1);
  }

  function upsertPost(p: Post) {
    setPosts((prev) => {
      const i = prev.findIndex((x) => x.id === p.id);
      if (i >= 0) { const n = [...prev]; n[i] = p; return n; }
      return [...prev, p];
    });
  }

  const filteredIdeas = ideaFilter === "todas" ? ideas : ideas.filter((i) => i.categories.includes(ideaFilter));

  return (
    <div>
      <header className="flex justify-between items-start gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-xl font-semibold">Comunidad</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Calendario de contenido interno del programa</p>
        </div>
        <button onClick={() => setNewIdea(true)} className="btn text-sm">+ Nueva idea</button>
      </header>

      {/* Navegación de mes */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="text-sm px-2 py-1 border border-neutral-200 rounded hover:bg-neutral-50">← Mes anterior</button>
        <div className="font-medium text-sm capitalize flex items-center gap-2">
          {monthLabel}
          {loading && <span className="text-xs text-neutral-400">cargando…</span>}
        </div>
        <button onClick={nextMonth} className="text-sm px-2 py-1 border border-neutral-200 rounded hover:bg-neutral-50">Mes siguiente →</button>
      </div>

      {/* Calendario */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[10px] uppercase text-neutral-400 font-medium text-center py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-6">
        {cells.map((d, idx) => {
          if (d === null) return <div key={idx} className="min-h-[84px] rounded-lg bg-neutral-50/50" />;
          const key = dayKey(year, month, d);
          const post = postsByDay[key];
          const meta = post ? categoryMeta(post.category) : null;
          const isToday = key === todayKey;
          return (
            <button
              key={idx}
              onClick={() => (post ? setEditingPost(post) : setNewPostDate(key))}
              className={`min-h-[84px] rounded-lg border p-1.5 text-left align-top transition-colors ${
                isToday ? "border-neutral-900" : "border-neutral-200"
              } hover:border-neutral-400`}
            >
              <div className="text-[11px] text-neutral-400 mb-1">{d}</div>
              {post && meta && (
                <div className="space-y-1">
                  <span className={`inline-block text-[9px] uppercase font-medium px-1.5 py-0.5 rounded border ${meta.badge}`}>
                    {meta.label}
                  </span>
                  {post.assignedToId && teamMap[post.assignedToId] && (
                    <div className="text-[10px] text-neutral-500 truncate">{teamMap[post.assignedToId]}</div>
                  )}
                  {post.text && <div className="text-[10px] text-neutral-600 line-clamp-2">{post.text}</div>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Banco de ideas */}
      <section>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <h2 className="font-semibold">Banco de ideas</h2>
          <div className="flex gap-1 flex-wrap">
            <FilterChip label="Todas" active={ideaFilter === "todas"} onClick={() => setIdeaFilter("todas")} />
            {COMMUNITY_CATEGORIES.map((c) => (
              <FilterChip key={c.value} label={c.label} active={ideaFilter === c.value} onClick={() => setIdeaFilter(c.value)} />
            ))}
          </div>
        </div>

        {filteredIdeas.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-8">
            {ideas.length === 0 ? "Aún no hay ideas. Añade la primera." : "No hay ideas en esta categoría."}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredIdeas.map((idea) => (
              <div key={idea.id} className="card flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1 mb-1">
                    {idea.categories.map((cat) => {
                      const meta = categoryMeta(cat);
                      return meta ? (
                        <span key={cat} className={`inline-block text-[9px] uppercase font-medium px-1.5 py-0.5 rounded border ${meta.badge}`}>
                          {meta.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                  <p className="text-sm text-neutral-700 whitespace-pre-wrap">{idea.text}</p>
                </div>
                <button onClick={() => setProgramming(idea)} className="btn btn-primary text-xs whitespace-nowrap flex-shrink-0">
                  📅 Programar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modales */}
      {(editingPost || newPostDate) && (
        <PostModal
          team={team}
          post={editingPost}
          dateStr={newPostDate}
          onClose={() => { setEditingPost(null); setNewPostDate(null); }}
          onSaved={(p) => { upsertPost(p); setEditingPost(null); setNewPostDate(null); }}
          onDeleted={(id) => { setPosts((prev) => prev.filter((x) => x.id !== id)); setEditingPost(null); }}
        />
      )}

      {newIdea && (
        <IdeaModal
          onClose={() => setNewIdea(false)}
          onSaved={(i) => { setIdeas((prev) => [i, ...prev]); setNewIdea(false); }}
        />
      )}

      {programming && (
        <ProgramModal
          idea={programming}
          monthHint={dayKey(year, month, 1)}
          onClose={() => setProgramming(null)}
          onScheduled={(post) => {
            setIdeas((prev) => prev.filter((x) => x.id !== programming.id));
            // Solo añadir al calendario si cae en el mes visible
            if (post.date.slice(0, 7) === `${year}-${pad(month + 1)}`) upsertPost(post);
            setProgramming(null);
          }}
        />
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border ${active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400"}`}
    >
      {label}
    </button>
  );
}

function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="input text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {COMMUNITY_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
    </select>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PostModal({
  team,
  post,
  dateStr,
  onClose,
  onSaved,
  onDeleted,
}: {
  team: TeamMember[];
  post: Post | null;
  dateStr: string | null;
  onClose: () => void;
  onSaved: (p: Post) => void;
  onDeleted: (id: string) => void;
}) {
  const date = post ? post.date.slice(0, 10) : dateStr!;
  const [category, setCategory] = useState<string>(post?.category ?? "educar");
  const [assignedToId, setAssignedToId] = useState(post?.assignedToId ?? "");
  const [text, setText] = useState(post?.text ?? "");
  const [done, setDone] = useState(post?.done ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const prettyDate = new Date(date + "T00:00:00.000Z").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/community/posts", {
      method: post ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(post ? { id: post.id, category, assignedToId, text, done } : { date, category, assignedToId, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) onSaved(data);
    else { setError(data.error || "No se pudo guardar."); setSaving(false); }
  }

  async function remove() {
    if (!post) return;
    if (!confirm("¿Eliminar el post de este día?")) return;
    setSaving(true);
    const res = await fetch(`/api/community/posts?id=${post.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(post.id);
    else { setError("No se pudo eliminar."); setSaving(false); }
  }

  return (
    <ModalShell title={post ? "Editar post" : "Nuevo post"} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-neutral-500 capitalize">{prettyDate}</p>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Categoría</label>
          <CategorySelect value={category} onChange={setCategory} />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Fisio que publica</label>
          <select className="input text-sm" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
            <option value="">Sin asignar</option>
            {team.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Contenido / idea</label>
          <textarea className="input text-sm" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {post && (
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
            Publicado
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-between items-center gap-2 pt-2 border-t border-neutral-100">
          {post ? <button onClick={remove} disabled={saving} className="text-sm text-red-600 hover:underline">Eliminar</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn btn-primary text-sm">{saving ? "Guardando..." : "Guardar"}</button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function IdeaModal({ onClose, onSaved }: { onClose: () => void; onSaved: (i: Idea) => void }) {
  const [categories, setCategories] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggle(cat: string) {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  async function save() {
    if (!text.trim()) { setError("Escribe la idea."); return; }
    if (categories.length === 0) { setError("Elige al menos una categoría."); return; }
    setSaving(true);
    setError("");
    const res = await fetch("/api/community/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) onSaved(data);
    else { setError(data.error || "No se pudo guardar."); setSaving(false); }
  }

  return (
    <ModalShell title="Nueva idea" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Categorías (una o varias)</label>
          <div className="flex flex-wrap gap-1.5">
            {COMMUNITY_CATEGORIES.map((c) => {
              const on = categories.includes(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggle(c.value)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${on ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400"}`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Idea</label>
          <textarea className="input text-sm" rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
          <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn btn-primary text-sm">{saving ? "Guardando..." : "Añadir"}</button>
        </div>
      </div>
    </ModalShell>
  );
}

function ProgramModal({
  idea,
  monthHint,
  onClose,
  onScheduled,
}: {
  idea: Idea;
  monthHint: string;
  onClose: () => void;
  onScheduled: (post: Post) => void;
}) {
  const [date, setDate] = useState(monthHint);
  const [category, setCategory] = useState(idea.categories[0] ?? "educar");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function schedule() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/community/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, category, text: idea.text, fromIdeaId: idea.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) onScheduled(data);
    else { setError(data.error || "No se pudo programar."); setSaving(false); }
  }

  return (
    <ModalShell title="Programar idea" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {idea.categories.map((cat) => {
            const m = categoryMeta(cat);
            return m ? (
              <span key={cat} className={`inline-block text-[9px] uppercase font-medium px-1.5 py-0.5 rounded border ${m.badge}`}>{m.label}</span>
            ) : null;
          })}
        </div>
        <p className="text-sm text-neutral-700 whitespace-pre-wrap">{idea.text}</p>
        {idea.categories.length > 1 && (
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Etiqueta para este día</label>
            <select className="input text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
              {idea.categories.map((cat) => {
                const m = categoryMeta(cat);
                return <option key={cat} value={cat}>{m?.label ?? cat}</option>;
              })}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-neutral-500 block mb-1">¿Qué día se publica?</label>
          <input type="date" className="input text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <p className="text-[11px] text-neutral-400">El fisio que publica se asigna después, en el calendario.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
          <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
          <button onClick={schedule} disabled={saving} className="btn btn-primary text-sm">{saving ? "Programando..." : "Programar"}</button>
        </div>
      </div>
    </ModalShell>
  );
}
