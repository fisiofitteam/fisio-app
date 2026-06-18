"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Lesson = {
  id: string;
  title: string;
  description: string;
  videoUrl: string | null;
  sectionTitle: string;
};

type Attachment = {
  id: string;
  kind: "pdf" | "link" | "image";
  url: string;
  name: string;
};

/** Extrae el ID de un link de YouTube (watch?v=, youtu.be/, shorts/). */
function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

function getVimeoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("vimeo")) return null;
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return /^\d+$/.test(last) ? last : null;
  } catch {
    return null;
  }
}

export function TutorialsLessonDetail({
  canManage,
  lesson,
  attachments,
}: {
  canManage: boolean;
  lesson: Lesson;
  attachments: Attachment[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  async function removeLesson() {
    if (!confirm("¿Eliminar esta lección? Se perderán también sus adjuntos.")) return;
    await fetch(`/api/training/lessons?id=${lesson.id}`, { method: "DELETE" });
    router.back();
  }

  const yt = lesson.videoUrl ? getYouTubeId(lesson.videoUrl) : null;
  const vm = lesson.videoUrl && !yt ? getVimeoId(lesson.videoUrl) : null;

  return (
    <div>
      <header className="mt-2 mb-4">
        <p className="text-xs text-neutral-500">{lesson.sectionTitle}</p>
        <h1 className="text-xl font-semibold mt-0.5">{lesson.title}</h1>
        {canManage && (
          <div className="flex gap-2 mt-2">
            <button onClick={() => setEditing(true)} className="btn btn-ghost text-xs">✏️ Editar lección</button>
            <button onClick={removeLesson} className="text-xs text-red-600">Borrar lección</button>
          </div>
        )}
      </header>

      {lesson.videoUrl && (
        <div className="mb-4 aspect-video bg-neutral-100 rounded-xl overflow-hidden">
          {yt ? (
            <iframe
              src={`https://www.youtube.com/embed/${yt}`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : vm ? (
            <iframe
              src={`https://player.vimeo.com/video/${vm}`}
              className="w-full h-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm text-neutral-500">
              <a href={lesson.videoUrl} target="_blank" rel="noopener noreferrer" className="underline">
                Abrir vídeo →
              </a>
            </div>
          )}
        </div>
      )}

      {lesson.description && (
        <div className="card mb-4 text-sm whitespace-pre-wrap">{lesson.description}</div>
      )}

      <section className="card">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-medium text-sm">📎 Adjuntos</h2>
          {canManage && <AddAttachmentButton lessonId={lesson.id} onAdded={() => router.refresh()} />}
        </div>
        {attachments.length === 0 ? (
          <p className="text-xs text-neutral-500 italic py-3 text-center">Sin adjuntos.</p>
        ) : (
          <ul className="space-y-1">
            {attachments.map((a) => (
              <AttachmentRow key={a.id} attachment={a} canManage={canManage} onRemoved={() => router.refresh()} />
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <LessonEditModal
          lesson={lesson}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

function AttachmentRow({
  attachment,
  canManage,
  onRemoved,
}: {
  attachment: Attachment;
  canManage: boolean;
  onRemoved: () => void;
}) {
  const icon = attachment.kind === "pdf" ? "📄" : attachment.kind === "image" ? "🖼️" : "🔗";
  async function remove() {
    if (!confirm("¿Eliminar este adjunto?")) return;
    await fetch(`/api/training/attachments?id=${attachment.id}`, { method: "DELETE" });
    onRemoved();
  }
  return (
    <li className="flex items-center gap-2 py-1.5 px-1 hover:bg-neutral-50 rounded">
      <span>{icon}</span>
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm text-neutral-700 hover:text-neutral-900 truncate">
        {attachment.name}
      </a>
      {canManage && (
        <button onClick={remove} className="text-xs text-red-600">Quitar</button>
      )}
    </li>
  );
}

function AddAttachmentButton({ lessonId, onAdded }: { lessonId: string; onAdded: () => void }) {
  const [mode, setMode] = useState<"closed" | "file" | "link">("closed");
  const [uploading, setUploading] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");

  async function uploadFile(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const r = await fetch("/api/training/upload", { method: "POST", body: form });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      alert(data?.error ?? "No se pudo subir el archivo");
      setUploading(false);
      return;
    }
    const data = await r.json();
    await fetch("/api/training/attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, kind: data.kind, url: data.url, name: data.name }),
    });
    setUploading(false);
    setMode("closed");
    onAdded();
  }

  async function saveLink() {
    if (!linkUrl.trim() || !linkName.trim()) return;
    await fetch("/api/training/attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, kind: "link", url: linkUrl.trim(), name: linkName.trim() }),
    });
    setLinkUrl(""); setLinkName(""); setMode("closed");
    onAdded();
  }

  if (mode === "closed") {
    return (
      <div className="flex gap-1">
        <button onClick={() => setMode("file")} className="text-xs text-neutral-500 hover:text-neutral-900">+ Subir archivo</button>
        <button onClick={() => setMode("link")} className="text-xs text-neutral-500 hover:text-neutral-900">+ Añadir link</button>
      </div>
    );
  }
  if (mode === "file") {
    return (
      <div className="flex gap-2 items-center">
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
          disabled={uploading}
          className="text-xs"
        />
        <button onClick={() => setMode("closed")} className="text-xs text-neutral-500">Cancelar</button>
        {uploading && <span className="text-xs text-neutral-400">Subiendo…</span>}
      </div>
    );
  }
  // link
  return (
    <div className="flex gap-2 items-center flex-wrap">
      <input className="input text-xs" placeholder="Nombre visible" value={linkName} onChange={(e) => setLinkName(e.target.value)} />
      <input className="input text-xs" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
      <button onClick={saveLink} disabled={!linkUrl.trim() || !linkName.trim()} className="btn btn-primary text-xs">Añadir</button>
      <button onClick={() => setMode("closed")} className="text-xs text-neutral-500">Cancelar</button>
    </div>
  );
}

function LessonEditModal({
  lesson,
  onClose,
  onSaved,
}: {
  lesson: Lesson;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState(lesson.description);
  const [videoUrl, setVideoUrl] = useState(lesson.videoUrl ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    await fetch("/api/training/lessons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lesson.id, title: title.trim(), description, videoUrl }),
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium">Editar lección</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Título</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Vídeo (URL YouTube o Vimeo) — opcional</label>
            <input className="input" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtu.be/…" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Descripción</label>
            <textarea className="input" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <button onClick={save} disabled={!title.trim() || saving} className="btn btn-primary w-full">
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
