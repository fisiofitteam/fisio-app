"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { youtubeEmbedUrl } from "@/lib/youtube";

type Video = {
  id: string;
  title: string;
  youtubeUrl: string;
  description: string;
  category: string;
  tags: string;
};

const CATEGORIES = [
  "Píldoras y gestión del dolor",
  "Educación en entrenamiento",
  "Proceso y programa",
  "Éxitos",
];

export function VideoLibraryEditor({ video }: { video: Video | null }) {
  const router = useRouter();
  const [title, setTitle] = useState(video?.title ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(video?.youtubeUrl ?? "");
  const [description, setDescription] = useState(video?.description ?? "");
  const [category, setCategory] = useState(video?.category ?? "Píldoras y gestión del dolor");
  const [tags, setTags] = useState(video?.tags ?? "");
  const [saving, setSaving] = useState(false);

  const embed = youtubeUrl ? youtubeEmbedUrl(youtubeUrl) : null;

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const method = video ? "PATCH" : "POST";
    const body = JSON.stringify({ ...(video && { id: video.id }), title, youtubeUrl, description, category, tags });
    await fetch("/api/library/videos", { method, headers: { "Content-Type": "application/json" }, body });
    router.push("/fisio/biblioteca/videos");
    router.refresh();
  }

  async function remove() {
    if (!video) return;
    if (!confirm("¿Eliminar este vídeo?")) return;
    await fetch(`/api/library/videos?id=${video.id}`, { method: "DELETE" });
    router.push("/fisio/biblioteca/videos");
    router.refresh();
  }

  return (
    <section className="card space-y-3">
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Título</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!video} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Categoría</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Etiquetas (CSV)</label>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hombro,anatomía" />
        </div>
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">URL de YouTube</label>
        <input className="input" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
      </div>
      {embed && (
        <div className="aspect-video rounded-lg overflow-hidden bg-black">
          <iframe src={embed} className="w-full h-full" allowFullScreen />
        </div>
      )}
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Descripción</label>
        <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex justify-between">
        {video ? <button onClick={remove} className="text-xs text-red-600">Eliminar</button> : <span />}
        <button onClick={save} disabled={!title.trim() || saving} className="btn btn-primary">
          {saving ? "Guardando..." : video ? "Guardar cambios" : "Crear vídeo"}
        </button>
      </div>
    </section>
  );
}
