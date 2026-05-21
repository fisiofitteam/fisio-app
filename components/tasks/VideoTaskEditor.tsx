"use client";

import { useEffect, useState } from "react";
import { youtubeEmbedUrl, youtubeThumbnail } from "@/lib/youtube";

type LibVideo = { id: string; title: string; youtubeUrl: string; description: string | null; category: string };

export function VideoTaskEditor({ task, onClose, onSave }: { task: any; onClose: () => void; onSave?: (snapshot: any) => void }) {
  const [title, setTitle] = useState(task.title);
  const [youtubeUrl, setYoutubeUrl] = useState(task.video?.youtubeUrl ?? task.youtubeUrl ?? "");
  const [description, setDescription] = useState(task.video?.description ?? task.description ?? "");
  const [saving, setSaving] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [library, setLibrary] = useState<LibVideo[]>([]);
  const [search, setSearch] = useState("");

  const embed = youtubeUrl ? youtubeEmbedUrl(youtubeUrl) : null;

  useEffect(() => {
    if (showLibrary) {
      fetch("/api/library/videos").then((r) => r.json()).then(setLibrary);
    }
  }, [showLibrary]);

  function importVideo(v: LibVideo) {
    setTitle(v.title);
    setYoutubeUrl(v.youtubeUrl);
    setDescription(v.description ?? "");
    setShowLibrary(false);
  }

  async function save() {
    setSaving(true);
    if (onSave) {
      onSave({ ...task, title, youtubeUrl, description });
      setSaving(false);
      onClose();
      return;
    }
    await fetch("/api/programs/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: task.id,
        title,
        video: { youtubeUrl, description },
      }),
    });
    setSaving(false);
    onClose();
  }

  const filtered = library.filter((v) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return v.title.toLowerCase().includes(s) || v.category.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-3">
      <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 text-xs text-rose-900">
        🎥 Vídeo / Mini-clase
      </div>

      <button
        onClick={() => setShowLibrary(!showLibrary)}
        className="btn btn-ghost text-xs w-full"
      >
        {showLibrary ? "Cerrar biblioteca" : "📚 Importar de biblioteca"}
      </button>

      {showLibrary && (
        <div className="border border-neutral-200 rounded-lg p-2">
          <input
            className="input text-sm mb-2"
            placeholder="🔍 Buscar por título o categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="max-h-60 overflow-y-auto space-y-1">
            {filtered.length === 0 && (
              <p className="text-xs text-neutral-500 text-center py-4">
                No hay vídeos{search ? " que coincidan" : " en biblioteca"}.
              </p>
            )}
            {filtered.map((v) => {
              const thumb = youtubeThumbnail(v.youtubeUrl);
              return (
                <button
                  key={v.id}
                  onClick={() => importVideo(v)}
                  className="w-full flex items-center gap-2 p-2 hover:bg-neutral-50 rounded text-left"
                >
                  {thumb ? (
                    <img src={thumb} alt="" className="w-16 h-10 object-cover rounded flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-10 bg-neutral-100 rounded flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{v.title}</div>
                    <div className="text-xs text-neutral-500">{v.category}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className="text-xs text-neutral-500 block mb-1">Título</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Mini-clase de anatomía del hombro" />
      </div>

      <div>
        <label className="text-xs text-neutral-500 block mb-1">URL de YouTube</label>
        <input className="input" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
        {youtubeUrl && !embed && (
          <p className="text-xs text-red-600 mt-1">No reconozco la URL.</p>
        )}
      </div>

      {embed && (
        <div className="aspect-video rounded-lg overflow-hidden bg-black">
          <iframe src={embed} className="w-full h-full" allowFullScreen />
        </div>
      )}

      <div>
        <label className="text-xs text-neutral-500 block mb-1">Descripción (opcional)</label>
        <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Sobre qué trata este vídeo..." />
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
        <button onClick={onClose} className="btn btn-ghost text-sm">Cancelar</button>
        <button onClick={save} disabled={saving || !title.trim()} className="btn btn-primary text-sm">
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}
