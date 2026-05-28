"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ImageUpload } from "@/components/ImageUpload";
import { CourseCover } from "@/components/CourseCover";
import {
  GraduationCap, MessageSquare, Plus, Trash2, Pencil, Pin,
  Eye, EyeOff, Heart, MessageCircle, BadgeCheck, X, Send,
} from "lucide-react";

type Course = {
  id: string; title: string; description: string | null; coverUrl: string | null;
  published: boolean; lessonCount: number; sectionCount: number;
};
type Post = {
  id: string; title: string | null; body: string; imageUrl: string | null;
  pinned: boolean; published: boolean; category: string;
  authorName: string | null; authorPhotoUrl: string | null; isPatient: boolean; createdAt: string;
  comments: number; reactions: number;
};

// Avatar del autor en el panel del pro: foto si la tiene, inicial con gradiente si no.
function Avatar({ url, name, size = 28 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return <img src={url} alt="" className="rounded-full object-cover flex-shrink-0 border border-neutral-200" style={{ width: size, height: size }} />;
  }
  return (
    <span className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
      style={{ width: size, height: size, background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)", color: "#0A0A0A", fontSize: Math.round(size * 0.42) }}>
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

type Tab = "classroom" | "community";

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

export function CommunityManager({
  initialCourses, initialPosts, canManage = true,
}: {
  initialCourses: Course[];
  initialPosts: Post[];
  canManage?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("community");
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [err, setErr] = useState<string | null>(null);

  function fail(e: unknown) {
    setErr(e instanceof Error ? e.message : "Algo ha fallado");
    setTimeout(() => setErr(null), 4000);
  }

  const TABS: { key: Tab; label: string; Icon: typeof GraduationCap; count: number }[] = canManage
    ? [
        { key: "community", label: "Comunidad", Icon: MessageSquare, count: posts.length },
        { key: "classroom", label: "Clases", Icon: GraduationCap, count: courses.length },
      ]
    : [
        { key: "community", label: "Comunidad", Icon: MessageSquare, count: posts.length },
      ];

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Comunidad</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          {canManage ? "Classroom, muro y vídeos. Esto es lo que verán los pacientes en su app." : "Muro de la comunidad. Publica, comenta y reacciona."}
        </p>
      </header>

      {err && <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700 border border-red-200">{err}</div>}

      {canManage && (
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
      )}

      {tab === "classroom" && canManage && <ClassroomSection courses={courses} setCourses={setCourses} fail={fail} />}
      {tab === "community" && <CommunitySection posts={posts} setPosts={setPosts} fail={fail} canModerate={canManage} />}
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
  posts, setPosts, fail, canModerate,
}: {
  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  fail: (e: unknown) => void;
  canModerate: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [viewingPost, setViewingPost] = useState<Post | null>(null);

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

      {posts.length === 0 ? (
        <p className="text-sm text-neutral-400 italic py-6 text-center">No hay posts todavía.</p>
      ) : (
        posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            canModerate={canModerate}
            onOpen={() => setViewingPost(p)}
            onChange={(u) => setPosts((a) => a.map((x) => (x.id === p.id ? u : x)))}
            onDelete={() => setPosts((a) => a.filter((x) => x.id !== p.id))}
            fail={fail}
          />
        ))
      )}

      {viewingPost && (
        <PostDetailModal
          post={viewingPost}
          onClose={() => setViewingPost(null)}
          onCommentAdded={() => {
            // Actualiza el contador del post en la lista
            setPosts((a) => a.map((x) => x.id === viewingPost.id ? { ...x, comments: x.comments + 1 } : x));
            setViewingPost((v) => v ? { ...v, comments: v.comments + 1 } : v);
          }}
        />
      )}
    </div>
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
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [pinned, setPinned] = useState(initial?.pinned ?? false);

  return (
    <div className="card space-y-2">
      <input className="input text-sm font-medium" placeholder="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input text-sm" rows={4} placeholder="Escribe algo para la comunidad..." value={body} onChange={(e) => setBody(e.target.value)} />
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
          onClick={() => body.trim() && onSave({ title: title.trim() || null, body: body.trim(), category: "general", imageUrl: imageUrl.trim() || null, pinned })}
          className="btn btn-primary text-sm"
        >
          Publicar
        </button>
      </div>
    </div>
  );
}

function PostCard({
  post, onOpen, onChange, onDelete, fail, canModerate,
}: {
  post: Post;
  onOpen: () => void;
  onChange: (p: Post) => void;
  onDelete: () => void;
  fail: (e: unknown) => void;
  canModerate: boolean;
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
    return <PostForm initial={post} onCancel={() => setEditing(false)} onSave={async (d) => { await patch(d); setEditing(false); }} />;
  }

  const date = new Date(post.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="card">
      {/* Cabecera: avatar + autor + fecha + acciones de moderación */}
      <div className="flex items-start gap-2 mb-2">
        <Avatar url={post.authorPhotoUrl} name={post.authorName ?? "Equipo"} size={28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {post.pinned && <Pin size={13} className="text-amber-500 flex-shrink-0" />}
            <span className="font-medium text-sm truncate">{post.authorName ?? "Equipo"}</span>
            {!post.isPatient && <BadgeCheck size={14} className="text-blue-600 flex-shrink-0" fill="#2563EB" stroke="#FFFFFF" />}
            <span className="text-[11px] text-neutral-400">· {date}</span>
            {!post.published && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">Oculto</span>}
          </div>
        </div>
        {canModerate && (
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
        )}
      </div>

      {/* Cuerpo clicable (abre detalle): título + texto + thumbnail pequeño a la derecha */}
      <button onClick={onOpen} className="w-full text-left block group">
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            {post.title && <h3 className="font-semibold text-base mb-1 group-hover:underline">{post.title}</h3>}
            <p className="text-sm whitespace-pre-line text-neutral-700 line-clamp-3 break-words">{post.body}</p>
          </div>
          {post.imageUrl && (
            <img src={post.imageUrl} alt="" className="rounded-lg object-cover flex-shrink-0 border border-neutral-200" style={{ width: 84, height: 84 }} />
          )}
        </div>
      </button>

      {/* Contadores + abrir comentarios */}
      <div className="flex items-center gap-4 text-xs text-neutral-500 pt-2 mt-2 border-t border-neutral-100">
        <span className="flex items-center gap-1"><Heart size={13} /> {post.reactions}</span>
        <button onClick={onOpen} className="flex items-center gap-1 hover:text-neutral-900">
          <MessageCircle size={13} /> {post.comments} {post.comments === 1 ? "comentario" : "comentarios"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── DETALLE DEL POST (modal con comentarios) ─────────────────────────── */

type Comment = { id: string; body: string; createdAt: string; authorName: string; authorPhotoUrl: string | null; isPatient: boolean };

function PostDetailModal({
  post, onClose, onCommentAdded,
}: {
  post: Post;
  onClose: () => void;
  onCommentAdded: () => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Carga inicial de comentarios
  useEffect(() => {
    (async () => {
      try {
        const c = await api(`/api/community/feed/${post.id}/comments`, "GET");
        setComments(c ?? []);
      } catch {
        setComments([]);
      }
      setLoading(false);
    })();
  }, [post.id]);

  async function send() {
    const body = newComment.trim();
    if (!body) return;
    setSending(true);
    setErr(null);
    try {
      const c = await api(`/api/community/feed/${post.id}/comments`, "POST", { body });
      setComments((arr) => [...(arr ?? []), c]);
      setNewComment("");
      onCommentAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo enviar");
    }
    setSending(false);
  }

  const date = new Date(post.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-xl w-full p-5 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Avatar url={post.authorPhotoUrl} name={post.authorName ?? "Equipo"} size={32} />
            {post.pinned && <Pin size={14} className="text-amber-500" />}
            <span className="font-medium text-sm">{post.authorName ?? "Equipo"}</span>
            {!post.isPatient && <BadgeCheck size={15} className="text-blue-600" fill="#2563EB" stroke="#FFFFFF" />}
            <span className="text-xs text-neutral-400">· {date}</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 p-1"><X size={18} /></button>
        </div>

        {post.title && <h2 className="font-semibold text-lg mb-2" style={{ letterSpacing: "-0.015em" }}>{post.title}</h2>}
        <p className="text-sm whitespace-pre-line text-neutral-700 break-words">{post.body}</p>
        {post.imageUrl && (
          <a href={post.imageUrl} target="_blank" rel="noreferrer">
            <img src={post.imageUrl} alt="" className="rounded-xl mt-3 w-full object-cover max-h-96 border border-neutral-200" />
          </a>
        )}

        <div className="flex items-center gap-4 text-xs text-neutral-500 pt-3 mt-3 border-t border-neutral-100">
          <span className="flex items-center gap-1"><Heart size={13} /> {post.reactions}</span>
          <span className="flex items-center gap-1"><MessageCircle size={13} /> {post.comments + (comments?.length && comments.length > post.comments ? (comments.length - post.comments) : 0)} comentarios</span>
        </div>

        {/* Comentarios */}
        <section className="mt-4">
          <h3 className="text-xs uppercase tracking-wide text-neutral-500 font-medium mb-2">Comentarios</h3>
          {loading ? (
            <p className="text-xs text-neutral-400 italic">Cargando…</p>
          ) : comments && comments.length > 0 ? (
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <span className="mt-0.5"><Avatar url={c.authorPhotoUrl} name={c.authorName} size={28} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-xs">
                      <span className="font-medium">{c.authorName}</span>
                      {!c.isPatient && <BadgeCheck size={12} className="text-blue-600" fill="#2563EB" stroke="#FFFFFF" />}
                      <span className="text-neutral-400 ml-1">· {new Date(c.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
                    </div>
                    <p className="text-sm text-neutral-700 mt-0.5 break-words">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-400 italic">Sin comentarios todavía.</p>
          )}

          {/* Añadir comentario como pro */}
          <div className="mt-4 flex items-center gap-2">
            <input
              className="input text-sm flex-1"
              placeholder="Escribe un comentario..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              disabled={sending}
            />
            <button onClick={send} disabled={!newComment.trim() || sending} className="btn btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50">
              <Send size={14} /> Enviar
            </button>
          </div>
          {err && <p className="text-xs mt-1" style={{ color: "#DC2626" }}>{err}</p>}
        </section>
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
