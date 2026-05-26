"use client";

import { useState } from "react";
import Link from "next/link";
import { PatientNav } from "@/components/PatientNav";
import { CourseCover } from "@/components/CourseCover";
import { FEED_CATEGORIES, feedCategoryMeta } from "@/lib/community-feed";
import { Heart, MessageCircle, Send, ChevronRight } from "lucide-react";

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
const CARD_STYLE = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" } as const;

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
    <main className="min-h-screen text-white" style={{ color: "#FAFAFA" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        <header className="mb-5">
          <Link href={`/paciente/${patientId}`} className="text-xs" style={{ color: "#737373" }}>← Inicio</Link>
          <h1 className="text-2xl font-bold mt-1" style={{ letterSpacing: "-0.025em" }}>Comunidad</h1>
        </header>

        {/* tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: "rgba(255,255,255,0.05)" }}>
          {(["community", "classroom"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
              style={tab === t ? { background: "#FCD34D", color: "#0A0A0A" } : { color: "#A3A3A3" }}
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
  const [filter, setFilter] = useState("all");
  const [composing, setComposing] = useState(false);
  const shown = filter === "all" ? posts : posts.filter((p) => p.category === filter);

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
          <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0" style={{ background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)", color: "#0A0A0A", fontSize: 12 }}>
            {myName.charAt(0).toUpperCase()}
          </span>
          <span style={{ color: "#737373" }}>Escribe algo para la comunidad…</span>
        </button>
      )}

      {/* filtros */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        <FilterPill active={filter === "all"} onClick={() => setFilter("all")} label="Todo" />
        {FEED_CATEGORIES.map((c) => (
          <FilterPill key={c.value} active={filter === c.value} onClick={() => setFilter(c.value)} label={`${c.emoji} ${c.label}`} />
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: "#737373" }}>No hay publicaciones todavía.</p>
      ) : (
        shown.map((p) => (
          <PostItem key={p.id} post={p} onChange={(u) => setPosts((a) => a.map((x) => (x.id === p.id ? u : x)))} />
        ))
      )}
    </div>
  );
}

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors"
      style={active ? { background: "#FCD34D", color: "#0A0A0A", fontWeight: 600 } : { background: "rgba(255,255,255,0.06)", color: "#A3A3A3" }}
    >
      {label}
    </button>
  );
}

function Composer({ onCancel, onPublished }: { onCancel: () => void; onPublished: (p: Post) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function publish() {
    if (!body.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const created = await api("/api/community/feed", "POST", { title: title.trim() || null, body: body.trim(), category });
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
        style={{ color: "#FAFAFA" }}
      />
      <textarea
        className="w-full bg-transparent text-sm outline-none resize-none"
        rows={4}
        placeholder="¿Qué quieres compartir?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        style={{ color: "#FAFAFA" }}
        autoFocus
      />
      {err && <p className="text-xs mt-1" style={{ color: "#FCA5A5" }}>{err}</p>}
      <div className="flex items-center gap-2 mt-3">
        <select
          className="text-xs rounded-lg px-2 py-1.5 outline-none"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ background: "rgba(255,255,255,0.08)", color: "#FAFAFA", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          {FEED_CATEGORIES.map((c) => <option key={c.value} value={c.value} style={{ background: "#1a1a1a" }}>{c.emoji} {c.label}</option>)}
        </select>
        <div className="flex-1" />
        <button onClick={onCancel} className="text-xs px-3 py-1.5" style={{ color: "#A3A3A3" }}>Cancelar</button>
        <button
          onClick={publish}
          disabled={saving || !body.trim()}
          className="text-xs font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50"
          style={{ background: "#FCD34D", color: "#0A0A0A" }}
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
  const cat = feedCategoryMeta(post.category);
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
        <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0" style={{ background: post.isPatient ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)", color: post.isPatient ? "#FAFAFA" : "#0A0A0A", fontSize: 12 }}>
          {post.authorName.charAt(0).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{post.authorName}</div>
          <div className="text-[11px]" style={{ color: "#737373" }}>{cat.emoji} {cat.label} · {date}</div>
        </div>
      </div>

      {post.title && <h3 className="font-semibold text-base mb-1" style={{ letterSpacing: "-0.015em" }}>{post.title}</h3>}
      <p className="text-sm whitespace-pre-line" style={{ color: "#D4D4D4" }}>{post.body}</p>
      {post.imageUrl && <img src={post.imageUrl} alt="" className="rounded-xl mt-3 w-full object-cover max-h-72" />}

      <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={toggleLike} className="flex items-center gap-1.5 text-sm" style={{ color: post.likedByMe ? "#FCD34D" : "#A3A3A3" }}>
          <Heart size={16} fill={post.likedByMe ? "#FCD34D" : "none"} /> {post.reactions}
        </button>
        <button onClick={openComments} className="flex items-center gap-1.5 text-sm" style={{ color: "#A3A3A3" }}>
          <MessageCircle size={16} /> {post.comments}
        </button>
      </div>

      {showComments && (
        <div className="mt-3 space-y-3">
          {loadingComments && <p className="text-xs" style={{ color: "#737373" }}>Cargando…</p>}
          {comments?.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <span className="w-6 h-6 rounded-full flex items-center justify-center font-bold flex-shrink-0 mt-0.5" style={{ background: c.isPatient ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)", color: c.isPatient ? "#FAFAFA" : "#0A0A0A", fontSize: 10 }}>
                {c.authorName.charAt(0).toUpperCase()}
              </span>
              <div className="flex-1">
                <span className="text-xs font-medium">{c.authorName}</span>
                <p className="text-sm" style={{ color: "#D4D4D4" }}>{c.body}</p>
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
              style={{ background: "rgba(255,255,255,0.06)", color: "#FAFAFA" }}
            />
            <button onClick={addComment} disabled={!newComment.trim()} className="p-2 rounded-lg disabled:opacity-40" style={{ background: "#FCD34D", color: "#0A0A0A" }}>
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
    return <p className="text-sm text-center py-8" style={{ color: "#737373" }}>Aún no hay cursos disponibles.</p>;
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
                <ChevronRight size={18} style={{ color: "#737373" }} />
              </div>
              {c.description && <p className="text-sm mt-1" style={{ color: "#A3A3A3" }}>{c.description}</p>}
              <div className="mt-3">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #FCD34D, #F59E0B)" }} />
                </div>
                <div className="text-[11px] mt-1" style={{ color: "#737373" }}>{pct}% · {c.doneCount}/{c.lessonCount} lecciones</div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
