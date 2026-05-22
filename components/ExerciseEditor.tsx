"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { youtubeEmbedUrl, youtubeThumbnail } from "@/lib/youtube";

type Exercise = {
  id: string;
  name: string;
  bodyZone: string;
  category: string;
  tags: string;
  youtubeUrl: string;
  description: string;
};

const BODY_ZONES = [
  { key: "hombro", label: "Hombro" },
  { key: "cervical", label: "Cervical" },
  { key: "lumbar", label: "Lumbar" },
  { key: "cadera", label: "Cadera" },
  { key: "rodilla", label: "Rodilla" },
  { key: "tobillo", label: "Tobillo" },
  { key: "otros", label: "Otros" },
];

const CATEGORIES = ["Movilidad", "Activación", "Fuerza", "Técnica", "Estiramiento", "Educacional", "Cardio", "Otro"];

export function ExerciseEditor({ exercise }: { exercise: Exercise | null }) {
  const router = useRouter();
  const [name, setName] = useState(exercise?.name ?? "");
  const [bodyZone, setBodyZone] = useState(exercise?.bodyZone ?? "otros");
  const [category, setCategory] = useState(exercise?.category ?? "Movilidad");
  const [tags, setTags] = useState(exercise?.tags ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(exercise?.youtubeUrl ?? "");
  const [description, setDescription] = useState(exercise?.description ?? "");
  const [saving, setSaving] = useState(false);

  const embed = youtubeUrl ? youtubeEmbedUrl(youtubeUrl) : null;
  const thumb = youtubeUrl ? youtubeThumbnail(youtubeUrl) : null;

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const method = exercise ? "PATCH" : "POST";
    const body = JSON.stringify({
      ...(exercise && { id: exercise.id }),
      name,
      bodyZone,
      category,
      tags,
      youtubeUrl,
      description,
    });
    const res = await fetch("/api/library", { method, headers: { "Content-Type": "application/json" }, body });
    if (res.ok) {
      router.push("/fisio/biblioteca/ejercicios");
      router.refresh();
    }
    setSaving(false);
  }

  async function remove() {
    if (!exercise) return;
    if (!confirm("¿Eliminar este ejercicio? Si está usado en algún programa, ahí seguirá visible.")) return;
    await fetch(`/api/library?id=${exercise.id}`, { method: "DELETE" });
    router.push("/fisio/biblioteca/ejercicios");
    router.refresh();
  }

  return (
    <section className="card space-y-3">
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
        <input
          className="input"
          placeholder="Ej: Cuban press con KB"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={!exercise}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Zona corporal</label>
          <select className="input" value={bodyZone} onChange={(e) => setBodyZone(e.target.value)}>
            {BODY_ZONES.map((z) => (
              <option key={z.key} value={z.key}>{z.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Categoría</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-neutral-500 block mb-1">Etiquetas (separadas por coma)</label>
        <input
          className="input"
          placeholder="hombro,escapular,activación"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs text-neutral-500 block mb-1">URL de YouTube</label>
        <input
          className="input"
          placeholder="https://www.youtube.com/watch?v=..."
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
        />
        {youtubeUrl && !embed && (
          <p className="text-xs text-red-600 mt-1">No reconozco el formato de la URL. Pega una URL de YouTube válida.</p>
        )}
      </div>

      {embed && (
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Preview</label>
          <div className="aspect-video rounded-lg overflow-hidden bg-black">
            <iframe
              src={embed}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      <div>
        <label className="text-xs text-neutral-500 block mb-1">Descripción / cues técnicos (lo verá el paciente)</label>
        <textarea
          className="input"
          rows={3}
          placeholder="Cómo se hace correctamente, qué evitar, etc."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex justify-between pt-2">
        {exercise ? (
          <button onClick={remove} className="text-xs text-red-600">Eliminar</button>
        ) : (
          <span />
        )}
        <button onClick={save} disabled={!name.trim() || saving} className="btn btn-primary">
          {saving ? "Guardando..." : exercise ? "Guardar cambios" : "Crear ejercicio"}
        </button>
      </div>
    </section>
  );
}
