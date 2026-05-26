"use client";

import { useState } from "react";
import Link from "next/link";
import { ImageUpload } from "@/components/ImageUpload";
import { CourseCover } from "@/components/CourseCover";
import { parseVideo } from "@/lib/video";
import { FEED_CATEGORIES, feedCategoryMeta } from "@/lib/community-feed";
import {
  GraduationCap, Film, MessageSquare, Plus, Trash2, Pencil, Pin,
  Eye, EyeOff, Heart, MessageCircle,
} from "lucide-react";

type Course = {
  id: string; title: string; description: string | null; coverUrl: string | null;
  published: boolean; lessonCount: number; sectionCount: number;
};
type Short = { id: string; title: string; description: string | null; videoUrl: string; published: boolean };
type Post = {
  id: string; title: string | null; body: string; imageUrl: string | null;
  pinned: boolean; published: boolean; category: string;
  authorName: string | null; isPatient: boolean; createdAt: string;
  comments: number; reactions: number;
};

type Tab = "classroom" | "community" | "videos";

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d?.error || "Error");
  }
  return res.status === 200 ? res.json() : null;
}

function VideoThumb({ url, className = "" }: { url: string; className?: string }) {
  const info = parseVideo(url);
  if (info.thumbnail) return <img src={info.thumbnail} alt="" className={`object-cover bg-neutral-100 ${className}`} />;
  return (
    <div className={`flex items-center justify-center bg-neutral-100 text-neutral-400 ${className}`}><Film size={20} /></div>
  );
}

export function CommunityManager({
  initialCourses, initialShorts, initialPosts,
}: {
  initialCourses: Course[];
  initialShorts: Short[];
  initialPosts: Post[];
}) {
  const [tab, setTab] = useState<Tab>("classroom");
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [shorts, setShorts] = useState<Short[]>(initialShorts);
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [err, setErr] = useState<string | null>(null);

  function fail(e: unknown) {
    setErr(e instanceof Error ? e.message : "Algo ha fallado");
    setTimeout(() => setErr(null), 4000);
  }

  const TABS: { key: Tab; label: string; Icon: typeof Film; count: number }[] = [
    { key: "classroom", label: "Classroom", Icon: GraduationCap, count: courses.length },
    { key: "community", label: "Community", Icon: MessageSquare, count: posts.length },
    { key: "videos", label: "Vídeos cortos", Icon: Film, count: shorts.length },
  ];

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Comunidad</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Classroom, muro y vídeos. Esto es lo que verán los pacientes en su app.
        </p>
      </header>

      {err && <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700 border border-red-200">{err}</div>}

      <div className="flex gap-2 mb-4">
        {TABS.map(({ key, label, Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === key ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            <Icon size={15} />
            {label}
            <span className={`text-xs ${tab === key ? "text-neutral-300" : "text-neutral-400"}`}>{count}</span>
          </button>
        ))}
      </div>

      {tab === "classroom" && <ClassroomSection courses={courses} setCourses={setCourses} fail={fail} />}
      {tab === "community" && <CommunitySection posts={posts} setPosts={setPosts} fail={fail} />}
      {tab === "videos" && <VideosSection shorts={shorts} setShorts={setShorts} fail={fail} />}
    </div>
  );
}

/* ─────────────────────────── CLASSROOM (cursos) ─────────────────────────── */

function ClassroomSection({
  courses, setCourses, fail,
}: {
  courses: Course[];
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
  fail: (e: unknown) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-neutral-500">Cursos del programa. Cada curso tiene secciones y, dentro, lecciones.</p>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn btn-primary text-sm flex items-center gap-1.5">
            <Plus size={15} /> Nuevo curso
          </button>
        )}
      </div>

      {adding && (
        <CourseForm
          onCancel={() => setAdding(false)}
          onSave={async (data) => {
            try {
              const created = await api("/api/community/modules", "POST", data);
              setCourses((a) => [...a, { ...created, lessonCount: 0, sectionCount: 0 }]);
              setAdding(false);
            } catch (e) { fail(e); }
          }}
        />
      )}

      {courses.length === 0 && !adding ? (
        <p className="text-sm text-neutral-400 italic py-8 text-center">Aún no hay cursos. Crea el primero.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              onChange={(u) => setCourses((a) => a.map((x) => (x.id === c.id ? u : x)))}
              onDelete={() => setCourses((a) => a.filter((x) => x.id !== c.id))}
              fail={fail}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseForm({
  initial, onSave, onCancel,
}: {
  initial?: { title: string; description: string | null; coverUrl: string | null };
  onSave: (data: { title: string; description: string | null; coverUrl: string | null }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? "");

  return (
    <div className="card space-y-3">
      <input className="input text-sm font-medium" placeholder="Título del curso (ej. GESTIÓN DEL DOLOR)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input text-sm" rows={2} placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Portada (opcional — si la dejas vacía se usa un fondo oscuro con el título)</label>
        <ImageUpload value={coverUrl} onChange={setCoverUrl} hint="Imagen de portada del curso." />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn text-sm">Cancelar</button>
        <button
          onClick={() => title.trim() && onSave({ title: title.trim(), description: description.trim() || null, coverUrl: coverUrl.trim() || null })}
          className="btn btn-primary text-sm"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

function CourseCard({
  course, onChange, onDelete, fail,
}: {
  course: Course;
  onChange: (c: Course) => void;
  onDelete: () => void;
  fail: (e: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);

  async function patch(data: any) {
    try { await api(`/api/community/modules/${course.id}`, "PATCH", data); onChange({ ...course, ...data }); }
    catch (e) { fail(e); }
  }
  async function remove() {
    if (!confirm(`¿Borrar el curso "${course.title}" con todas sus secciones y lecciones?`)) return;
    try { await api(`/api/community/modules/${course.id}`, "DELETE"); onDelete(); }
    catch (e) { fail(e); }
  }

  if (editing) {
    return <CourseForm initial={course} onCancel={() => setEditing(false)} onSave={async (d) => { await patch(d); setEditing(false); }} />;
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden flex flex-col">
      <Link href={`/fisio/comunidad/curso/${course.id}`}>
        <CourseCover title={course.title} coverUrl={course.coverUrl} className="aspect-[16/10]" />
      </Link>
      <div className="p-3 flex-1 flex flex-col">
        <div className="flex items-center gap-2">
          <Link href={`/fisio/comunidad/curso/${course.id}`} className="font-semibold text-sm hover:underline flex-1">{course.title}</Link>
          {!course.published && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">Oculto</span>}
        </div>
        {course.description && <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{course.description}</p>}
        <p className="text-[11px] text-neutral-400 mt-1">
          {course.sectionCount} sección{course.sectionCount === 1 ? "" : "es"} · {course.lessonCount} lección{course.lessonCount === 1 ? "" : "es"}
        </p>
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-neutral-100">
          <Link href={`/fisio/comunidad/curso/${course.id}`} className="text-xs text-neutral-600 hover:text-neutral-900 font-medium flex-1">Editar contenido →</Link>
          <IconBtn title={course.published ? "Ocultar" : "Publicar"} onClick={() => patch({ published: !course.published })}>
            {course.published ? <Eye size={15} /> : <EyeOff size={15} />}
          </IconBtn>
          <IconBtn title="Editar curso" onClick={() => setEditing(true)}><Pencil size={15} /></IconBtn>
          <IconBtn title="Borrar" onClick={remove} danger><Trash2 size={15} /></IconBtn>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── COMMUNITY (muro) ─────────────────────────── */

function CommunitySection({
  posts, setPosts, fail,
}: {
  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  fail: (e: unknown) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const shown = filter === "all" ? posts : posts.filter((p) => p.category === filter);

  return (
    <div className="space-y-3">
      {adding ? (
        <PostForm
          onCancel={() => setAdding(false)}
          onSave={async (data) => {
            try { const created = await api("/api/community/feed", "POST", data); setPosts((a) => [created, ...a]); setAdding(false); }
            catch (e) { fail(e); }
          }}
        />
      ) : (
        <button onClick={() => setAdding(true)} className="btn btn-primary text-sm flex items-center gap-1.5">
          <Plus size={15} /> Nuevo post
        </button>
      )}

      {/* filtros por categoría */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <CatPill active={filter === "all"} onClick={() => setFilter("all")} label="Todo" />
        {FEED_CATEGORIES.map((c) => (
          <CatPill key={c.value} active={filter === c.value} onClick={() => setFilter(c.value)} label={`${c.emoji} ${c.label}`} />
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-neutral-400 italic py-6 text-center">No hay posts {filter !== "all" ? "en esta categoría" : "todavía"}.</p>
      ) : (
        shown.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            onChange={(u) => setPosts((a) => a.map((x) => (x.id === p.id ? u : x)))}
            onDelete={() => setPosts((a) => a.filter((x) => x.id !== p.id))}
            fail={fail}
          />
        ))
      )}
    </div>
  );
}

function CatPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs whitespace-nowrap border transition-colors ${
        active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
      }`}
    >
      {label}
    </button>
  );
}

function PostForm({
  initial, onSave, onCancel,
}: {
  initial?: Post;
  onSave: (data: { title: string | null; body: string; category: string; imageUrl: string | null; pinned: boolean }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [category, setCategory] = useState(initial?.category ?? "general");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [pinned, setPinned] = useState(initial?.pinned ?? false);

  return (
    <div className="card space-y-2">
      <input className="input text-sm font-medium" placeholder="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input text-sm" rows={4} placeholder="Escribe algo para la comunidad..." value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex items-center gap-2">
        <label className="text-xs text-neutral-500">Categoría</label>
        <select className="input text-sm w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          {FEED_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Imagen (opcional)</label>
        <ImageUpload value={imageUrl} onChange={setImageUrl} hint="Imagen del post." />
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="w-4 h-4 accent-neutral-900" />
        Fijar arriba
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn text-sm">Cancelar</button>
        <button
          onClick={() => body.trim() && onSave({ title: title.trim() || null, body: body.trim(), category, imageUrl: imageUrl.trim() || null, pinned })}
          className="btn btn-primary text-sm"
        >
          Publicar
        </button>
      </div>
    </div>
  );
}

function PostCard({
  post, onChange, onDelete, fail,
}: {
  post: Post;
  onChange: (p: Post) => void;
  onDelete: () => void;
  fail: (e: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const cat = feedCategoryMeta(post.category);

  async function patch(data: any) {
    try { const u = await api(`/api/community/feed/${post.id}`, "PATCH", data); onChange({ ...post, ...u }); }
    catch (e) { fail(e); }
  }
  async function remove() {
    if (!confirm("¿Borrar este post, sus comentarios y reacciones?")) return;
    try { await api(`/api/community/feed/${post.id}`, "DELETE"); onDelete(); }
    catch (e) { fail(e); }
  }

  if (editing) {
    return <PostForm initial={post} onCancel={() => setEditing(false)} onSave={async (d) => { await patch(d); setEditing(false); }} />;
  }

  const date = new Date(post.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="card space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {post.pinned && <Pin size={13} className="text-amber-500 flex-shrink-0" />}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${cat.chip}`}>{cat.emoji} {cat.label}</span>
            {post.title && <h3 className="font-medium text-sm">{post.title}</h3>}
            {!post.published && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">Oculto</span>}
          </div>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            {post.authorName ?? "Equipo"}{post.isPatient ? " · paciente" : ""} · {date}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <IconBtn title={post.pinned ? "Desfijar" : "Fijar"} onClick={() => patch({ pinned: !post.pinned })}>
            <Pin size={15} className={post.pinned ? "text-amber-500" : ""} />
          </IconBtn>
          <IconBtn title={post.published ? "Ocultar" : "Publicar"} onClick={() => patch({ published: !post.published })}>
            {post.published ? <Eye size={15} /> : <EyeOff size={15} />}
          </IconBtn>
          <IconBtn title="Editar" onClick={() => setEditing(true)}><Pencil size={15} /></IconBtn>
          <IconBtn title="Borrar" onClick={remove} danger><Trash2 size={15} /></IconBtn>
        </div>
      </div>
      <p className="text-sm whitespace-pre-line text-neutral-700">{post.body}</p>
      {post.imageUrl && <img src={post.imageUrl} alt="" className="rounded-lg border border-neutral-200 max-h-72 object-cover" />}
      <div className="flex items-center gap-4 text-xs text-neutral-500 pt-1">
        <span className="flex items-center gap-1"><Heart size={13} /> {post.reactions}</span>
        <span className="flex items-center gap-1"><MessageCircle size={13} /> {post.comments}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────── VÍDEOS CORTOS ─────────────────────────── */

function VideosSection({
  shorts, setShorts, fail,
}: {
  shorts: Short[];
  setShorts: React.Dispatch<React.SetStateAction<Short[]>>;
  fail: (e: unknown) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      {adding ? (
        <ShortForm
          onCancel={() => setAdding(false)}
          onSave={async (data) => {
            try { const created = await api("/api/community/shorts", "POST", data); setShorts((a) => [created, ...a]); setAdding(false); }
            catch (e) { fail(e); }
          }}
        />
      ) : (
        <button onClick={() => setAdding(true)} className="btn btn-primary text-sm flex items-center gap-1.5">
          <Plus size={15} /> Nuevo vídeo corto
        </button>
      )}

      {shorts.length === 0 && !adding && <p className="text-sm text-neutral-400 italic py-6 text-center">Aún no hay vídeos cortos.</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shorts.map((s) => (
          <ShortCard
            key={s.id}
            short={s}
            onChange={(u) => setShorts((a) => a.map((x) => (x.id === s.id ? u : x)))}
            onDelete={() => setShorts((a) => a.filter((x) => x.id !== s.id))}
            fail={fail}
          />
        ))}
      </div>
    </div>
  );
}

function ShortForm({
  initial, onSave, onCancel,
}: {
  initial?: Short;
  onSave: (data: { title: string; videoUrl: string; description: string | null }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  return (
    <div className="card space-y-2">
      <input className="input text-sm" placeholder="Título del vídeo" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className="input text-sm" placeholder="Enlace YouTube o Vimeo" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
      <textarea className="input text-sm" rows={2} placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn text-sm">Cancelar</button>
        <button
          onClick={() => title.trim() && videoUrl.trim() && onSave({ title: title.trim(), videoUrl: videoUrl.trim(), description: description.trim() || null })}
          className="btn btn-primary text-sm"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

function ShortCard({
  short, onChange, onDelete, fail,
}: {
  short: Short;
  onChange: (s: Short) => void;
  onDelete: () => void;
  fail: (e: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);

  async function patch(data: any) {
    try { await api(`/api/community/shorts/${short.id}`, "PATCH", data); onChange({ ...short, ...data }); }
    catch (e) { fail(e); }
  }
  async function remove() {
    if (!confirm(`¿Borrar el vídeo "${short.title}"?`)) return;
    try { await api(`/api/community/shorts/${short.id}`, "DELETE"); onDelete(); }
    catch (e) { fail(e); }
  }

  if (editing) {
    return <ShortForm initial={short} onCancel={() => setEditing(false)} onSave={async (d) => { await patch(d); setEditing(false); }} />;
  }

  return (
    <div className="card p-0 overflow-hidden">
      <VideoThumb url={short.videoUrl} className="w-full aspect-video" />
      <div className="p-3">
        <div className="flex items-center gap-1.5">
          <h3 className="font-medium text-sm flex-1 truncate">{short.title}</h3>
          {!short.published && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">Oculto</span>}
        </div>
        {short.description && <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{short.description}</p>}
        <div className="flex items-center gap-1 mt-2">
          <IconBtn title={short.published ? "Ocultar" : "Publicar"} onClick={() => patch({ published: !short.published })}>
            {short.published ? <Eye size={15} /> : <EyeOff size={15} />}
          </IconBtn>
          <IconBtn title="Editar" onClick={() => setEditing(true)}><Pencil size={15} /></IconBtn>
          <IconBtn title="Borrar" onClick={remove} danger><Trash2 size={15} /></IconBtn>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── UI helpers ─────────────────────────── */

function IconBtn({
  children, onClick, title, danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded-md transition-colors ${danger ? "text-neutral-400 hover:text-red-600 hover:bg-red-50" : "text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100"}`}
    >
      {children}
    </button>
  );
}
