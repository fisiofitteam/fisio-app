"use client";

import { useState } from "react";
import { ImageUpload } from "@/components/ImageUpload";
import { parseVideo } from "@/lib/video";
import {
  GraduationCap, Film, MessageSquare, Plus, Trash2, Pencil, Pin,
  Eye, EyeOff, Heart, MessageCircle,
} from "lucide-react";

type Lesson = { id: string; title: string; description: string | null; videoUrl: string };
type Module = { id: string; title: string; description: string | null; coverUrl: string | null; published: boolean; lessons: Lesson[] };
type Short = { id: string; title: string; description: string | null; videoUrl: string; published: boolean };
type Post = {
  id: string; title: string | null; body: string; imageUrl: string | null;
  pinned: boolean; published: boolean; authorName: string | null; createdAt: string;
  comments: number; reactions: number;
};

type Tab = "clases" | "videos" | "posts";

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
  if (info.thumbnail) {
    return <img src={info.thumbnail} alt="" className={`object-cover bg-neutral-100 ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-neutral-100 text-neutral-400 ${className}`}>
      <Film size={20} />
    </div>
  );
}

export function CommunityManager({
  initialModules, initialShorts, initialPosts,
}: {
  initialModules: Module[];
  initialShorts: Short[];
  initialPosts: Post[];
}) {
  const [tab, setTab] = useState<Tab>("clases");
  const [modules, setModules] = useState<Module[]>(initialModules);
  const [shorts, setShorts] = useState<Short[]>(initialShorts);
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [err, setErr] = useState<string | null>(null);

  function fail(e: unknown) {
    setErr(e instanceof Error ? e.message : "Algo ha fallado");
    setTimeout(() => setErr(null), 4000);
  }

  const TABS: { key: Tab; label: string; Icon: typeof Film; count: number }[] = [
    { key: "clases", label: "Clases del programa", Icon: GraduationCap, count: modules.length },
    { key: "videos", label: "Vídeos cortos", Icon: Film, count: shorts.length },
    { key: "posts", label: "Posts", Icon: MessageSquare, count: posts.length },
  ];

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Comunidad</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Clases, vídeos cortos y muro. Esto es lo que verán los pacientes en su app.
        </p>
      </header>

      {err && (
        <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700 border border-red-200">{err}</div>
      )}

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

      {tab === "clases" && <ClasesSection modules={modules} setModules={setModules} fail={fail} />}
      {tab === "videos" && <VideosSection shorts={shorts} setShorts={setShorts} fail={fail} />}
      {tab === "posts" && <PostsSection posts={posts} setPosts={setPosts} fail={fail} />}
    </div>
  );
}

/* ─────────────────────────── CLASES ─────────────────────────── */

function ClasesSection({
  modules, setModules, fail,
}: {
  modules: Module[];
  setModules: React.Dispatch<React.SetStateAction<Module[]>>;
  fail: (e: unknown) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      {modules.length === 0 && !adding && (
        <p className="text-sm text-neutral-400 italic py-6 text-center">
          Aún no hay módulos. Crea el primero para organizar las clases del programa.
        </p>
      )}

      {modules.map((m) => (
        <ModuleCard
          key={m.id}
          module={m}
          onChange={(updated) => setModules((arr) => arr.map((x) => (x.id === m.id ? updated : x)))}
          onDelete={() => setModules((arr) => arr.filter((x) => x.id !== m.id))}
          fail={fail}
        />
      ))}

      {adding ? (
        <ModuleForm
          onCancel={() => setAdding(false)}
          onSave={async (data) => {
            try {
              const created = await api("/api/community/modules", "POST", data);
              setModules((arr) => [...arr, { ...created, lessons: [] }]);
              setAdding(false);
            } catch (e) { fail(e); }
          }}
        />
      ) : (
        <button onClick={() => setAdding(true)} className="btn btn-primary text-sm flex items-center gap-1.5">
          <Plus size={15} /> Nuevo módulo
        </button>
      )}
    </div>
  );
}

function ModuleForm({
  initial, onSave, onCancel,
}: {
  initial?: Module;
  onSave: (data: { title: string; description: string | null; coverUrl: string | null }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? "");

  return (
    <div className="card space-y-3">
      <input className="input text-sm font-medium" placeholder="Título del módulo (ej. Cervical)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input text-sm" rows={2} placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Portada (opcional)</label>
        <ImageUpload value={coverUrl} onChange={setCoverUrl} hint="Imagen de portada del módulo." />
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

function ModuleCard({
  module, onChange, onDelete, fail,
}: {
  module: Module;
  onChange: (m: Module) => void;
  onDelete: () => void;
  fail: (e: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [addingLesson, setAddingLesson] = useState(false);

  async function patch(data: any) {
    try {
      await api(`/api/community/modules/${module.id}`, "PATCH", data);
      onChange({ ...module, ...data });
    } catch (e) { fail(e); }
  }

  async function remove() {
    if (!confirm(`¿Borrar el módulo "${module.title}" y todas sus clases?`)) return;
    try { await api(`/api/community/modules/${module.id}`, "DELETE"); onDelete(); }
    catch (e) { fail(e); }
  }

  if (editing) {
    return (
      <ModuleForm
        initial={module}
        onCancel={() => setEditing(false)}
        onSave={async (data) => { await patch(data); setEditing(false); }}
      />
    );
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-3">
        {module.coverUrl && <img src={module.coverUrl} alt="" className="w-14 h-14 rounded-lg object-cover border border-neutral-200 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm">{module.title}</h3>
            {!module.published && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">Oculto</span>}
          </div>
          {module.description && <p className="text-xs text-neutral-500 mt-0.5">{module.description}</p>}
          <p className="text-[11px] text-neutral-400 mt-0.5">{module.lessons.length} clase{module.lessons.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <IconBtn title={module.published ? "Ocultar" : "Publicar"} onClick={() => patch({ published: !module.published })}>
            {module.published ? <Eye size={15} /> : <EyeOff size={15} />}
          </IconBtn>
          <IconBtn title="Editar" onClick={() => setEditing(true)}><Pencil size={15} /></IconBtn>
          <IconBtn title="Borrar" onClick={remove} danger><Trash2 size={15} /></IconBtn>
        </div>
      </div>

      <div className="border-t border-neutral-100 pt-2 space-y-1.5">
        {module.lessons.map((l) => (
          <LessonRow
            key={l.id}
            lesson={l}
            onChange={(u) => onChange({ ...module, lessons: module.lessons.map((x) => (x.id === l.id ? u : x)) })}
            onDelete={() => onChange({ ...module, lessons: module.lessons.filter((x) => x.id !== l.id) })}
            fail={fail}
          />
        ))}

        {addingLesson ? (
          <LessonForm
            onCancel={() => setAddingLesson(false)}
            onSave={async (data) => {
              try {
                const created = await api("/api/community/lessons", "POST", { ...data, moduleId: module.id });
                onChange({ ...module, lessons: [...module.lessons, created] });
                setAddingLesson(false);
              } catch (e) { fail(e); }
            }}
          />
        ) : (
          <button onClick={() => setAddingLesson(true)} className="text-xs text-neutral-500 hover:text-neutral-900 flex items-center gap-1 pl-1">
            <Plus size={13} /> Añadir clase
          </button>
        )}
      </div>
    </div>
  );
}

function LessonRow({
  lesson, onChange, onDelete, fail,
}: {
  lesson: Lesson;
  onChange: (l: Lesson) => void;
  onDelete: () => void;
  fail: (e: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);

  async function remove() {
    if (!confirm(`¿Borrar la clase "${lesson.title}"?`)) return;
    try { await api(`/api/community/lessons/${lesson.id}`, "DELETE"); onDelete(); }
    catch (e) { fail(e); }
  }

  if (editing) {
    return (
      <LessonForm
        initial={lesson}
        onCancel={() => setEditing(false)}
        onSave={async (data) => {
          try { await api(`/api/community/lessons/${lesson.id}`, "PATCH", data); onChange({ ...lesson, ...data }); setEditing(false); }
          catch (e) { fail(e); }
        }}
      />
    );
  }

  return (
    <div className="flex items-center gap-2.5 py-1">
      <VideoThumb url={lesson.videoUrl} className="w-14 h-9 rounded flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{lesson.title}</div>
        {lesson.description && <div className="text-[11px] text-neutral-400 truncate">{lesson.description}</div>}
      </div>
      <IconBtn title="Editar" onClick={() => setEditing(true)}><Pencil size={13} /></IconBtn>
      <IconBtn title="Borrar" onClick={remove} danger><Trash2 size={13} /></IconBtn>
    </div>
  );
}

function LessonForm({
  initial, onSave, onCancel,
}: {
  initial?: Lesson;
  onSave: (data: { title: string; videoUrl: string; description: string | null }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  return (
    <div className="rounded-lg border border-neutral-200 p-3 space-y-2 bg-neutral-50">
      <input className="input text-sm" placeholder="Título de la clase" value={title} onChange={(e) => setTitle(e.target.value)} />
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

      {shorts.length === 0 && !adding && (
        <p className="text-sm text-neutral-400 italic py-6 text-center">Aún no hay vídeos cortos.</p>
      )}

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
    return (
      <ShortForm
        initial={short}
        onCancel={() => setEditing(false)}
        onSave={async (data) => { await patch(data); setEditing(false); }}
      />
    );
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

/* ─────────────────────────── POSTS ─────────────────────────── */

function PostsSection({
  posts, setPosts, fail,
}: {
  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  fail: (e: unknown) => void;
}) {
  const [adding, setAdding] = useState(false);

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

      {posts.length === 0 && !adding && (
        <p className="text-sm text-neutral-400 italic py-6 text-center">Aún no hay posts en el muro.</p>
      )}

      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          onChange={(u) => setPosts((a) => a.map((x) => (x.id === p.id ? u : x)))}
          onDelete={() => setPosts((a) => a.filter((x) => x.id !== p.id))}
          fail={fail}
        />
      ))}
    </div>
  );
}

function PostForm({
  initial, onSave, onCancel,
}: {
  initial?: Post;
  onSave: (data: { title: string | null; body: string; imageUrl: string | null; pinned: boolean }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [pinned, setPinned] = useState(initial?.pinned ?? false);

  return (
    <div className="card space-y-2">
      <input className="input text-sm font-medium" placeholder="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input text-sm" rows={4} placeholder="Escribe el post para la comunidad..." value={body} onChange={(e) => setBody(e.target.value)} />
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
          onClick={() => body.trim() && onSave({ title: title.trim() || null, body: body.trim(), imageUrl: imageUrl.trim() || null, pinned })}
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
    return (
      <PostForm
        initial={post}
        onCancel={() => setEditing(false)}
        onSave={async (data) => { await patch(data); setEditing(false); }}
      />
    );
  }

  const date = new Date(post.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="card space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {post.pinned && <Pin size={13} className="text-amber-500 flex-shrink-0" />}
            {post.title && <h3 className="font-medium text-sm">{post.title}</h3>}
            {!post.published && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">Oculto</span>}
          </div>
          <p className="text-[11px] text-neutral-400">{post.authorName ?? "Equipo"} · {date}</p>
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
