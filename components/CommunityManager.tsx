"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ImageUpload } from "@/components/ImageUpload";
import { CourseCover } from "@/components/CourseCover";
import { parseVideo } from "@/lib/video";
import {
  GraduationCap, MessageSquare, Plus, Trash2, Pencil, Pin,
  Eye, EyeOff, Heart, MessageCircle, BadgeCheck, X, Send, Video,
  ImagePlus, CornerDownRight,
} from "lucide-react";

type Course = {
  id: string; title: string; description: string | null; coverUrl: string | null;
  published: boolean; lessonCount: number; sectionCount: number;
};
type Post = {
  id: string; title: string | null; body: string; imageUrl: string | null; videoUrl: string | null;
  pinned: boolean; published: boolean; category: string;
  authorName: string | null; authorPhotoUrl: string | null; isPatient: boolean; createdAt: string;
  comments: number; reactions: number;
  likedByMe?: boolean;
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
  initialCourses, initialPosts, canManageClassroom = true, canModerate = true, lastSeenAt,
}: {
  initialCourses: Course[];
  initialPosts: Post[];
  canManageClassroom?: boolean;
  canModerate?: boolean;
  /** ISO. Timestamp de la última visita ANTES de esta pantalla. Se usa
   *  para pintar badges "NUEVO" en posts y comentarios. */
  lastSeenAt?: string;
}) {
  const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  const [tab, setTab] = useState<Tab>("community");
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [err, setErr] = useState<string | null>(null);

  function fail(e: unknown) {
    setErr(e instanceof Error ? e.message : "Algo ha fallado");
    setTimeout(() => setErr(null), 4000);
  }

  const TABS: { key: Tab; label: string; Icon: typeof GraduationCap; count: number }[] = canManageClassroom
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
          {canManageClassroom ? "Classroom, muro y vídeos. Esto es lo que verán los pacientes en su app." : "Muro de la comunidad. Publica, comenta y reacciona."}
        </p>
      </header>

      {err && <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700 border border-red-200">{err}</div>}

      {canManageClassroom && (
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

      {tab === "classroom" && canManageClassroom && <ClassroomSection courses={courses} setCourses={setCourses} fail={fail} />}
      {tab === "community" && <CommunitySection posts={posts} setPosts={setPosts} fail={fail} canModerate={canModerate} lastSeenMs={lastSeenMs} />}
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
  posts, setPosts, fail, canModerate, lastSeenMs = 0,
}: {
  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  fail: (e: unknown) => void;
  canModerate: boolean;
  lastSeenMs?: number;
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
            lastSeenMs={lastSeenMs}
          />
        ))
      )}

      {viewingPost && (
        <PostDetailModal
          post={viewingPost}
          canModerate={canModerate}
          onClose={() => setViewingPost(null)}
          lastSeenMs={lastSeenMs}
          onCommentAdded={() => {
            // Actualiza el contador del post en la lista
            setPosts((a) => a.map((x) => x.id === viewingPost.id ? { ...x, comments: x.comments + 1 } : x));
            setViewingPost((v) => v ? { ...v, comments: v.comments + 1 } : v);
          }}
          onCommentDeleted={() => {
            setPosts((a) => a.map((x) => x.id === viewingPost.id ? { ...x, comments: Math.max(0, x.comments - 1) } : x));
            setViewingPost((v) => v ? { ...v, comments: Math.max(0, v.comments - 1) } : v);
          }}
          onLikeChange={(liked, count) => {
            setPosts((a) => a.map((x) => x.id === viewingPost.id ? { ...x, likedByMe: liked, reactions: count } : x));
            setViewingPost((v) => v ? { ...v, likedByMe: liked, reactions: count } : v);
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
  onSave: (data: { title: string | null; body: string; category: string; imageUrl: string | null; videoUrl: string | null; pinned: boolean }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? "");
  const [pinned, setPinned] = useState(initial?.pinned ?? false);

  const videoInfo = videoUrl ? parseVideo(videoUrl) : null;
  const videoOk = !videoUrl || videoInfo?.provider != null;

  return (
    <div className="card space-y-2">
      <input className="input text-sm font-medium" placeholder="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input text-sm" rows={4} placeholder="Escribe algo para la comunidad..." value={body} onChange={(e) => setBody(e.target.value)} />
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Imagen (opcional)</label>
        <ImageUpload value={imageUrl} onChange={setImageUrl} hint="Imagen del post." />
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Vídeo (URL de YouTube o Vimeo, opcional)</label>
        <input
          className="input text-sm"
          placeholder="https://youtube.com/watch?v=… o https://vimeo.com/…"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
        />
        {videoUrl && !videoOk && (
          <p className="text-[11px] text-red-600 mt-1">No reconozco esa URL. Usa un enlace de YouTube o Vimeo.</p>
        )}
        {videoInfo?.provider && (
          <p className="text-[11px] text-emerald-700 mt-1">✓ Vídeo de {videoInfo.provider === "youtube" ? "YouTube" : "Vimeo"} detectado.</p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="w-4 h-4 accent-neutral-900" />
        Fijar arriba
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn text-sm">Cancelar</button>
        <button
          onClick={() => body.trim() && videoOk && onSave({ title: title.trim() || null, body: body.trim(), category: "general", imageUrl: imageUrl.trim() || null, videoUrl: videoUrl.trim() || null, pinned })}
          disabled={!body.trim() || !videoOk}
          className="btn btn-primary text-sm disabled:opacity-50"
        >
          Publicar
        </button>
      </div>
    </div>
  );
}

function PostCard({
  post, onOpen, onChange, onDelete, fail, canModerate, lastSeenMs = 0,
}: {
  post: Post;
  onOpen: () => void;
  onChange: (p: Post) => void;
  onDelete: () => void;
  fail: (e: unknown) => void;
  canModerate: boolean;
  lastSeenMs?: number;
}) {
  const postIsNew = new Date(post.createdAt).getTime() > lastSeenMs;
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
  async function toggleLike() {
    // Optimista: cambio local antes de la respuesta.
    const willLike = !post.likedByMe;
    onChange({ ...post, likedByMe: willLike, reactions: Math.max(0, post.reactions + (willLike ? 1 : -1)) });
    try {
      const r = await api(`/api/community/feed/${post.id}/react`, "POST");
      onChange({ ...post, likedByMe: r.liked, reactions: r.count });
    } catch (e) {
      // Rollback en caso de fallo
      onChange({ ...post, likedByMe: !willLike, reactions: post.reactions });
      fail(e);
    }
  }

  if (editing) {
    return <PostForm initial={post} onCancel={() => setEditing(false)} onSave={async (d) => { await patch(d); setEditing(false); }} />;
  }

  const date = new Date(post.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="card" style={postIsNew ? { borderLeft: "4px solid #F59E0B" } : undefined}>
      {/* Cabecera: avatar + autor + fecha + acciones de moderación */}
      <div className="flex items-start gap-2 mb-2">
        <Avatar url={post.authorPhotoUrl} name={post.authorName ?? "Equipo"} size={28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {post.pinned && <Pin size={13} className="text-amber-500 flex-shrink-0" />}
            <span className="font-medium text-sm truncate">{post.authorName ?? "Equipo"}</span>
            {!post.isPatient && <BadgeCheck size={14} className="text-blue-600 flex-shrink-0" fill="#2563EB" stroke="#FFFFFF" />}
            <span className="text-[11px] text-neutral-400">· {date}</span>
            {postIsNew && (
              <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full bg-amber-500 text-white">
                Nuevo
              </span>
            )}
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

      {/* Cuerpo clicable (abre detalle): título + texto + miniatura a la derecha
           (imagen si la hay; si no, miniatura de YouTube del vídeo; si no, badge "🎥 Vídeo") */}
      <button onClick={onOpen} className="w-full text-left block group">
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            {post.title && <h3 className="font-semibold text-base mb-1 group-hover:underline">{post.title}</h3>}
            <p className="text-sm whitespace-pre-line text-neutral-700 line-clamp-3 break-words">{post.body}</p>
          </div>
          {(() => {
            const videoInfo = post.videoUrl ? parseVideo(post.videoUrl) : null;
            const thumb = post.imageUrl || videoInfo?.thumbnail || null;
            if (thumb) {
              return (
                <div className="relative flex-shrink-0">
                  <img src={thumb} alt="" className="rounded-lg object-cover border border-neutral-200" style={{ width: 84, height: 84 }} />
                  {!post.imageUrl && videoInfo?.provider && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-lg" style={{ background: "rgba(0,0,0,0.35)" }}>
                      <Video size={20} className="text-white" />
                    </span>
                  )}
                </div>
              );
            }
            if (post.videoUrl) {
              return (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 flex items-center justify-center text-neutral-500 flex-shrink-0" style={{ width: 84, height: 84 }}>
                  <Video size={20} />
                </div>
              );
            }
            return null;
          })()}
        </div>
      </button>

      {/* Contadores + abrir comentarios */}
      <div className="flex items-center gap-4 text-xs text-neutral-500 pt-2 mt-2 border-t border-neutral-100">
        <button
          onClick={toggleLike}
          title={post.likedByMe ? "Quitar me gusta" : "Me gusta"}
          className={`flex items-center gap-1 transition-colors ${post.likedByMe ? "text-red-500" : "hover:text-neutral-900"}`}
        >
          <Heart size={13} fill={post.likedByMe ? "currentColor" : "none"} />
          {post.reactions}
        </button>
        <button onClick={onOpen} className="flex items-center gap-1 hover:text-neutral-900">
          <MessageCircle size={13} /> {post.comments} {post.comments === 1 ? "comentario" : "comentarios"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── DETALLE DEL POST (modal con comentarios) ─────────────────────────── */

type Comment = {
  id: string;
  body: string;
  imageUrl: string | null;
  parentId: string | null;
  createdAt: string;
  authorName: string;
  authorPhotoUrl: string | null;
  isPatient: boolean;
};

function PostDetailModal({
  post, canModerate, onClose, onCommentAdded, onCommentDeleted, onLikeChange, lastSeenMs = 0,
}: {
  post: Post;
  canModerate: boolean;
  onClose: () => void;
  onCommentAdded: () => void;
  onCommentDeleted: () => void;
  onLikeChange: (liked: boolean, count: number) => void;
  lastSeenMs?: number;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [newImageUrl, setNewImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [likeBusy, setLikeBusy] = useState(false);

  async function toggleLike() {
    if (likeBusy) return;
    setLikeBusy(true);
    try {
      const r = await api(`/api/community/feed/${post.id}/react`, "POST");
      onLikeChange(r.liked, r.count);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo dar me gusta");
    }
    setLikeBusy(false);
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "No se pudo subir la imagen");
      }
      const data = await res.json();
      setNewImageUrl(data.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo subir");
    }
    setUploading(false);
  }

  async function deleteComment(id: string) {
    if (!confirm("¿Borrar este comentario?")) return;
    setDeleting(id);
    setErr(null);
    try {
      await api(`/api/community/comments/${id}`, "DELETE");
      // Borra el comentario y sus replies (cascade en BD, pero limpio local).
      setComments((arr) => (arr ?? []).filter((c) => c.id !== id && c.parentId !== id));
      onCommentDeleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo borrar");
    }
    setDeleting(null);
  }

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
    if (!body && !newImageUrl) return;
    setSending(true);
    setErr(null);
    try {
      const c = await api(`/api/community/feed/${post.id}/comments`, "POST", {
        body,
        imageUrl: newImageUrl,
        parentId: replyTo?.id ?? null,
      });
      setComments((arr) => [...(arr ?? []), c]);
      setNewComment("");
      setNewImageUrl(null);
      setReplyTo(null);
      onCommentAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo enviar");
    }
    setSending(false);
  }

  const date = new Date(post.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

  // Anida los comentarios por parentId
  const topLevel = (comments ?? []).filter((c) => !c.parentId);
  const repliesByParent = new Map<string, Comment[]>();
  for (const c of comments ?? []) {
    if (!c.parentId) continue;
    const arr = repliesByParent.get(c.parentId) ?? [];
    arr.push(c);
    repliesByParent.set(c.parentId, arr);
  }

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
        {post.videoUrl && (() => {
          const v = parseVideo(post.videoUrl);
          if (v.embedUrl) {
            return (
              <div className="rounded-xl mt-3 overflow-hidden border border-neutral-200" style={{ aspectRatio: "16/9" }}>
                <iframe src={v.embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            );
          }
          return <video src={post.videoUrl} controls className="rounded-xl mt-3 w-full max-h-96 border border-neutral-200" />;
        })()}

        <div className="flex items-center gap-4 text-xs text-neutral-500 pt-3 mt-3 border-t border-neutral-100">
          <button
            onClick={toggleLike}
            disabled={likeBusy}
            title={post.likedByMe ? "Quitar me gusta" : "Me gusta"}
            className={`flex items-center gap-1 transition-colors disabled:opacity-50 ${post.likedByMe ? "text-red-500" : "hover:text-neutral-900"}`}
          >
            <Heart size={13} fill={post.likedByMe ? "currentColor" : "none"} /> {post.reactions}
          </button>
          <span className="flex items-center gap-1">
            <MessageCircle size={13} /> {comments?.length ?? post.comments} comentarios
          </span>
        </div>

        {/* Comentarios */}
        <section className="mt-4">
          <h3 className="text-xs uppercase tracking-wide text-neutral-500 font-medium mb-2">Comentarios</h3>
          {loading ? (
            <p className="text-xs text-neutral-400 italic">Cargando…</p>
          ) : topLevel.length > 0 ? (
            <div className="space-y-3">
              {topLevel.map((c) => (
                <CommentItem
                  key={c.id}
                  c={c}
                  replies={repliesByParent.get(c.id) ?? []}
                  canModerate={canModerate}
                  onReply={() => setReplyTo(c)}
                  onDelete={() => deleteComment(c.id)}
                  onDeleteReply={(rid) => { if (confirm("¿Borrar esta respuesta?")) deleteComment(rid); }}
                  deleting={deleting}
                  lastSeenMs={lastSeenMs}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-400 italic">Sin comentarios todavía.</p>
          )}

          {/* Añadir comentario / responder */}
          <div className="mt-4">
            {replyTo && (
              <div className="mb-2 flex items-center justify-between text-[11px] bg-neutral-50 rounded px-2 py-1.5 border border-neutral-200">
                <span className="text-neutral-500">
                  Respondiendo a <span className="font-medium text-neutral-800">{replyTo.authorName}</span>
                </span>
                <button onClick={() => setReplyTo(null)} className="text-neutral-400 hover:text-neutral-900">
                  <X size={13} />
                </button>
              </div>
            )}
            {newImageUrl && (
              <div className="mb-2 relative inline-block">
                <img src={newImageUrl} alt="" className="rounded max-h-32 border border-neutral-200" />
                <button
                  onClick={() => setNewImageUrl(null)}
                  className="absolute -top-2 -right-2 bg-white rounded-full border border-neutral-300 p-0.5 shadow-sm"
                  title="Quitar imagen"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="cursor-pointer text-neutral-500 hover:text-neutral-900 p-2 rounded border border-neutral-200 hover:bg-neutral-50" title="Adjuntar imagen">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadImage(f);
                    e.currentTarget.value = "";
                  }}
                />
                {uploading ? <span className="text-[10px]">…</span> : <ImagePlus size={16} />}
              </label>
              <input
                className="input text-sm flex-1"
                placeholder={replyTo ? `Responder a ${replyTo.authorName}...` : "Escribe un comentario..."}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                disabled={sending}
              />
              <button
                onClick={send}
                disabled={(!newComment.trim() && !newImageUrl) || sending}
                className="btn btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send size={14} /> Enviar
              </button>
            </div>
          </div>
          {err && <p className="text-xs mt-1" style={{ color: "#DC2626" }}>{err}</p>}
        </section>
      </div>
    </div>
  );
}

function CommentItem({
  c, replies, canModerate, onReply, onDelete, onDeleteReply, deleting, lastSeenMs = 0,
}: {
  c: Comment;
  replies: Comment[];
  canModerate: boolean;
  onReply: () => void;
  onDelete: () => void;
  onDeleteReply: (replyId: string) => void;
  deleting: string | null;
  lastSeenMs?: number;
}) {
  const isNew = new Date(c.createdAt).getTime() > lastSeenMs;
  return (
    <div
      className="flex gap-2.5 group"
      style={isNew ? { borderLeft: "3px solid #F59E0B", paddingLeft: 8, marginLeft: -11 } : undefined}
    >
      <span className="mt-0.5"><Avatar url={c.authorPhotoUrl} name={c.authorName} size={28} /></span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-xs">
          <span className="font-medium">{c.authorName}</span>
          {!c.isPatient && <BadgeCheck size={12} className="text-blue-600" fill="#2563EB" stroke="#FFFFFF" />}
          <span className="text-neutral-400 ml-1">· {new Date(c.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
          {isNew && (
            <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 rounded ml-1 bg-amber-500 text-white">
              Nuevo
            </span>
          )}
        </div>
        {c.body && <p className="text-sm text-neutral-700 mt-0.5 break-words">{c.body}</p>}
        {c.imageUrl && (
          <a href={c.imageUrl} target="_blank" rel="noreferrer">
            <img src={c.imageUrl} alt="" className="rounded-lg mt-1.5 max-h-64 border border-neutral-200" />
          </a>
        )}
        <button
          onClick={onReply}
          className="text-[10px] text-neutral-500 hover:text-neutral-900 mt-1 flex items-center gap-0.5"
        >
          <CornerDownRight size={10} /> Responder
        </button>

        {replies.length > 0 && (
          <div className="mt-2 space-y-2 pl-3 border-l-2 border-neutral-100">
            {replies.map((r) => {
              const rIsNew = new Date(r.createdAt).getTime() > lastSeenMs;
              return (
              <div key={r.id} className="flex gap-2 group">
                <span className="mt-0.5"><Avatar url={r.authorPhotoUrl} name={r.authorName} size={22} /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="font-medium">{r.authorName}</span>
                    {!r.isPatient && <BadgeCheck size={10} className="text-blue-600" fill="#2563EB" stroke="#FFFFFF" />}
                    <span className="text-neutral-400 ml-1">· {new Date(r.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
                    {rIsNew && (
                      <span className="text-[8px] font-bold tracking-widest uppercase px-1 rounded ml-0.5 bg-amber-500 text-white">
                        Nuevo
                      </span>
                    )}
                  </div>
                  {r.body && <p className="text-[13px] text-neutral-700 mt-0.5 break-words">{r.body}</p>}
                  {r.imageUrl && (
                    <a href={r.imageUrl} target="_blank" rel="noreferrer">
                      <img src={r.imageUrl} alt="" className="rounded-lg mt-1 max-h-56 border border-neutral-200" />
                    </a>
                  )}
                </div>
                {canModerate && (
                  <button
                    onClick={() => onDeleteReply(r.id)}
                    className="text-neutral-300 hover:text-red-600 p-1 -mt-0.5 h-fit opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Borrar respuesta"
                    disabled={deleting === r.id}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
      {canModerate && (
        <button
          onClick={onDelete}
          disabled={deleting === c.id}
          title="Borrar comentario"
          className="text-neutral-300 hover:text-red-600 p-1 -mt-0.5 h-fit opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
        >
          <Trash2 size={13} />
        </button>
      )}
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
