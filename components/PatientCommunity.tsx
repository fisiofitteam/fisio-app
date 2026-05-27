"use client";

import { useState } from "react";
import Link from "next/link";
import { PatientNav } from "@/components/PatientNav";
import { CourseCover } from "@/components/CourseCover";
import { Heart, MessageCircle, Send, ChevronRight, BadgeCheck } from "lucide-react";

type Post = {
  id: string; title: string | null; body: string; imageUrl: string | null;
  category: string; pinned: boolean; authorName: string; isPatient: boolean;
  createdAt: string; comments: number; reactions: number; likedByMe: boolean;
};
type Course = {
  id: string; title: string; description: string | null; coverUrl: string | null;
  lessonCount: number; doneCount: number;
};
type Comment = { id: string; body: string; createdAt: string; authorName: string; isPatient: boolean };

const CARD = "rounded-2xl p-4";
const CARD_STYLE = { background: "var(--p-surface)", border: "1px solid var(--p-border)" } as const;

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Error");
  return res.status === 200 ? res.json() : null;
}

export function PatientCommunity({
  patientId, myName, initialPosts, courses,
}: {
  patientId: string;
  myName: string;
  initialPosts: Post[];
  courses: Course[];
}) {
  const [tab, setTab] = useState<"community" | "classroom">("community");
  const [posts, setPosts] = useState<Post[]>(initialPosts);

  return (
    <main className="min-h-screen text-white" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        <header className="mb-5">
          <Link href={`/paciente/${patientId}`} className="text-xs" style={{ color: "var(--p-text-faint)" }}>← Inicio</Link>
          <h1 className="text-2xl font-bold mt-1" style={{ letterSpacing: "-0.025em" }}>Comunidad</h1>
        </header>

        {/* tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: "var(--p-surface)" }}>
          {(["community", "classroom"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
              style={tab === t ? { background: "var(--p-accent)", color: "var(--p-accent-ink)" } : { color: "var(--p-text-dim)" }}
            >
              {t === "community" ? "Community" : "Classroom"}
            </button>
          ))}
        </div>

        {tab === "community" ? (
          <CommunityFeed posts={posts} setPosts={setPosts} myName={myName} />
        ) : (
          <Classroom courses={courses} patientId={patientId} />
        )}
      </div>

      <PatientNav patientId={patientId} active="comunidad" />
    </main>
  );
}

/* ─────────────────── COMMUNITY (muro) ─────────────────── */

function CommunityFeed({
  posts, setPosts, myName,
}: {
  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  myName: string;
}) {
  const [composing, setComposing] = useState(false);

  return (
    <div className="space-y-3">
      {/* composer */}
      {composing ? (
        <Composer
          onCancel={() => setComposing(false)}
          onPublished={(p) => { setPosts((a) => [p, ...a]); setComposing(false); }}
        />
      ) : (
        <button
          onClick={() => setComposing(true)}
          className={`${CARD} w-full text-left text-sm flex items-center gap-3`}
          style={CARD_STYLE}
        >
          <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0" style={{ background: "linear-gradient(135deg, var(--p-accent) 0%, #F59E0B 100%)", color: "var(--p-accent-ink)", fontSize: 12 }}>
            {myName.charAt(0).toUpperCase()}
          </span>
          <span style={{ color: "var(--p-text-faint)" }}>Escribe algo para la comunidad…</span>
        </button>
      )}

      {posts.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: "var(--p-text-faint)" }}>No hay publicaciones todavía.</p>
      ) : (
        posts.map((p) => (
          <PostItem key={p.id} post={p} onChange={(u) => setPosts((a) => a.map((x) => (x.id === p.id ? u : x)))} />
        ))
      )}
    </div>
  );
}

// Nombre del autor con insignia de verificación si es un profesional del equipo.
function AuthorName({ name, isPatient, size = "sm" }: { name: string; isPatient: boolean; size?: "sm" | "xs" }) {
  return (
    <span className={`inline-flex items-center gap-1 min-w-0 font-medium ${size === "sm" ? "text-sm" : "text-xs"}`}>
      <span className="truncate">{name}</span>
      {!isPatient && (
        <BadgeCheck size={size === "sm" ? 15 : 13} className="flex-shrink-0" style={{ color: "var(--p-accent)" }} fill="var(--p-accent)" stroke="var(--p-accent-ink)" />
      )}
    </span>
  );
}

function Composer({ onCancel, onPublished }: { onCancel: () => void; onPublished: (p: Post) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function publish() {
    if (!body.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const created = await api("/api/community/feed", "POST", { title: title.trim() || null, body: body.trim(), category: "general" });
      onPublished({
        id: created.id, title: created.title, body: created.body, imageUrl: created.imageUrl,
        category: created.category, pinned: created.pinned,
        authorName: created.patientAuthor?.fullName ?? "Yo", isPatient: true,
        createdAt: created.createdAt, comments: 0, reactions: 0, likedByMe: false,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo publicar");
      setSaving(false);
    }
  }

  return (
    <div className={CARD} style={CARD_STYLE}>
      <input
        className="w-full bg-transparent text-sm font-medium outline-none mb-2"
        placeholder="Título (opcional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ color: "var(--p-text)" }}
      />
      <textarea
        className="w-full bg-transparent text-sm outline-none resize-none"
        rows={4}
        placeholder="¿Qué quieres compartir?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        style={{ color: "var(--p-text)" }}
        autoFocus
      />
      {err && <p className="text-xs mt-1" style={{ color: "#FCA5A5" }}>{err}</p>}
      <div className="flex items-center gap-2 mt-3">
        <div className="flex-1" />
        <button onClick={onCancel} className="text-xs px-3 py-1.5" style={{ color: "var(--p-text-dim)" }}>Cancelar</button>
        <button
          onClick={publish}
          disabled={saving || !body.trim()}
          className="text-xs font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50"
          style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}
        >
          {saving ? "Publicando…" : "Publicar"}
        </button>
      </div>
    </div>
  );
}

function PostItem({ post, onChange }: { post: Post; onChange: (p: Post) => void }) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const date = new Date(post.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  async function toggleLike() {
    // optimista
    const optimistic = { ...post, likedByMe: !post.likedByMe, reactions: post.reactions + (post.likedByMe ? -1 : 1) };
    onChange(optimistic);
    try {
      const r = await api(`/api/community/feed/${post.id}/react`, "POST");
      onChange({ ...post, likedByMe: r.liked, reactions: r.count });
    } catch {
      onChange(post); // revertir
    }
  }

  async function openComments() {
    setShowComments((s) => !s);
    if (comments === null && !loadingComments) {
      setLoadingComments(true);
      try { setComments(await api(`/api/community/feed/${post.id}/comments`, "GET")); }
      catch { setComments([]); }
      setLoadingComments(false);
    }
  }

  async function addComment() {
    if (!newComment.trim()) return;
    const body = newComment.trim();
    setNewComment("");
    try {
      const c = await api(`/api/community/feed/${post.id}/comments`, "POST", { body });
      setComments((arr) => [...(arr ?? []), c]);
      onChange({ ...post, comments: post.comments + 1 });
    } catch { setNewComment(body); }
  }

  return (
    <div className={CARD} style={CARD_STYLE}>
      <div className="flex items-center gap-2.5 mb-2">
        <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0" style={{ background: post.isPatient ? "var(--p-border-strong)" : "linear-gradient(135deg, var(--p-accent) 0%, #F59E0B 100%)", color: post.isPatient ? "var(--p-text)" : "var(--p-accent-ink)", fontSize: 12 }}>
          {post.authorName.charAt(0).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <AuthorName name={post.authorName} isPatient={post.isPatient} />
          <div className="text-[11px]" style={{ color: "var(--p-text-faint)" }}>{date}</div>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          {post.title && <h3 className="font-semibold text-base mb-1" style={{ letterSpacing: "-0.015em" }}>{post.title}</h3>}
          <p className="text-sm whitespace-pre-line break-words" style={{ color: "var(--p-text-soft)" }}>{post.body}</p>
        </div>
        {post.imageUrl && (
          <a href={post.imageUrl} target="_blank" rel="noreferrer" className="flex-shrink-0">
            <img src={post.imageUrl} alt="" className="rounded-lg object-cover" style={{ width: 76, height: 76, border: "1px solid var(--p-border)" }} />
          </a>
        )}
      </div>

      <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: "1px solid var(--p-surface-2)" }}>
        <button onClick={toggleLike} className="flex items-center gap-1.5 text-sm" style={{ color: post.likedByMe ? "var(--p-accent)" : "var(--p-text-dim)" }}>
          <Heart size={16} fill={post.likedByMe ? "var(--p-accent)" : "none"} /> {post.reactions}
        </button>
        <button onClick={openComments} className="flex items-center gap-1.5 text-sm" style={{ color: "var(--p-text-dim)" }}>
          <MessageCircle size={16} /> {post.comments}
        </button>
      </div>

      {showComments && (
        <div className="mt-3 space-y-3">
          {loadingComments && <p className="text-xs" style={{ color: "var(--p-text-faint)" }}>Cargando…</p>}
          {comments?.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <span className="w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0 mt-0.5" style={{ background: c.isPatient ? "var(--p-border-strong)" : "linear-gradient(135deg, var(--p-accent) 0%, #F59E0B 100%)", color: c.isPatient ? "var(--p-text)" : "var(--p-accent-ink)", fontSize: 10 }}>
                {c.authorName.charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <AuthorName name={c.authorName} isPatient={c.isPatient} size="xs" />
                <p className="text-sm" style={{ color: "var(--p-text-soft)" }}>{c.body}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              className="flex-1 text-sm rounded-lg px-3 py-2 outline-none"
              placeholder="Escribe un comentario…"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addComment(); }}
              style={{ background: "var(--p-surface-2)", color: "var(--p-text)" }}
            />
            <button onClick={addComment} disabled={!newComment.trim()} className="p-2 rounded-lg disabled:opacity-40" style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}>
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── CLASSROOM ─────────────────── */

function Classroom({ courses, patientId }: { courses: Course[]; patientId: string }) {
  if (courses.length === 0) {
    return <p className="text-sm text-center py-8" style={{ color: "var(--p-text-faint)" }}>Aún no hay cursos disponibles.</p>;
  }
  return (
    <div className="space-y-4">
      {courses.map((c) => {
        const pct = c.lessonCount > 0 ? Math.round((c.doneCount / c.lessonCount) * 100) : 0;
        return (
          <Link
            key={c.id}
            href={`/paciente/${patientId}/comunidad/curso/${c.id}`}
            className="block rounded-2xl overflow-hidden"
            style={CARD_STYLE}
          >
            <CourseCover title={c.title} coverUrl={c.coverUrl} className="aspect-[16/9]" />
            <div className="p-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base flex-1" style={{ letterSpacing: "-0.015em" }}>{c.title}</h3>
                <ChevronRight size={18} style={{ color: "var(--p-text-faint)" }} />
              </div>
              {c.description && <p className="text-sm mt-1" style={{ color: "var(--p-text-dim)" }}>{c.description}</p>}
              <div className="mt-3">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--p-border-strong)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--p-accent), #F59E0B)" }} />
                </div>
                <div className="text-[11px] mt-1" style={{ color: "var(--p-text-faint)" }}>{pct}% · {c.doneCount}/{c.lessonCount} lecciones</div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
