"use client";

import { useEffect, useState } from "react";
import { youtubeThumbnail } from "@/lib/youtube";

export function WorkoutTaskEditor({ task, onClose, onSave }: { task: any; onClose: () => void; onSave?: (snapshot: any) => void }) {
  const [title, setTitle] = useState(task.title);
  const [bodyText, setBodyText] = useState(task.workout?.bodyText ?? task.bodyText ?? "");
  const [linkedExercises, setLinkedExercises] = useState<any[]>(
    task.workout?.exercises?.map((we: any) => we.exercise) ?? task.linkedExercises ?? []
  );
  const [library, setLibrary] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/library").then((r) => r.json()).then(setLibrary);
  }, []);

  const filteredLibrary = library.filter((ex) => {
    if (linkedExercises.some((le) => le.id === ex.id)) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return ex.name.toLowerCase().includes(s) || ex.tags.toLowerCase().includes(s) || ex.category.toLowerCase().includes(s);
  });

  function linkExercise(ex: any) {
    setLinkedExercises((prev) => [...prev, ex]);
    setSearch("");
  }

  function unlinkExercise(id: string) {
    setLinkedExercises((prev) => prev.filter((e) => e.id !== id));
  }

  async function save() {
    setSaving(true);
    // Modo snapshot: devuelve el task actualizado por callback
    if (onSave) {
      onSave({
        ...task,
        title,
        bodyText,
        linkedExercises,
      });
      setSaving(false);
      onClose();
      return;
    }
    // Modo BD: guarda directamente en program task
    await fetch("/api/programs/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: task.id,
        title,
        workout: {
          bodyText,
          exerciseIds: linkedExercises.map((e) => e.id),
        },
      }),
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-900">
        🏋️ Workout · escribe el bloque tal cual se lo entregarías al paciente
      </div>

      <div>
        <label className="text-xs text-neutral-500 block mb-1">Título</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Movilidad de hombro - 25 min" />
      </div>

      <div>
        <label className="text-xs text-neutral-500 block mb-1">Bloque de sesión</label>
        <textarea
          className="input font-mono text-sm"
          rows={12}
          placeholder={`A) Calentamiento (5 min)\n3 rondas:\n- 10 cat-camel\n- 10 wall slides\n\nB) Bloque principal (15 min)\nEMOM 10:\n- Par: 5 strict press @ 30 kg\n- Impar: 8 ring rows`}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
        />
        <p className="text-xs text-neutral-400 mt-1">
          Escribe libremente: AMRAP, EMOM, intervalos, tabata, lo que sea.
        </p>
      </div>

      <div>
        <label className="text-xs text-neutral-500 block mb-2">Ejercicios vinculados (vídeos que verá el paciente)</label>

        <div className="space-y-1 mb-2">
          {linkedExercises.map((ex) => {
            const thumb = ex.youtubeUrl ? youtubeThumbnail(ex.youtubeUrl) : null;
            return (
              <div key={ex.id} className="flex items-center gap-2 p-2 bg-neutral-50 rounded-lg">
                {thumb ? (
                  <img src={thumb} alt="" className="w-16 h-10 object-cover rounded flex-shrink-0" />
                ) : (
                  <div className="w-16 h-10 bg-neutral-200 rounded flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{ex.name}</div>
                  <div className="text-xs text-neutral-500 truncate">{ex.category}</div>
                </div>
                <button onClick={() => unlinkExercise(ex.id)} className="text-xs text-red-600 px-2">✕</button>
              </div>
            );
          })}
        </div>

        {!showSearch ? (
          <button onClick={() => setShowSearch(true)} className="btn btn-ghost text-xs w-full">
            + Vincular ejercicio de mi biblioteca
          </button>
        ) : (
          <div className="border border-neutral-200 rounded-lg p-2">
            <div className="flex gap-2 mb-2">
              <input
                className="input text-sm"
                placeholder="🔍 Buscar por nombre, categoría o etiqueta..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              <button onClick={() => setShowSearch(false)} className="text-xs text-neutral-500 px-2">
                Cerrar
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filteredLibrary.slice(0, 20).map((ex) => {
                const thumb = ex.youtubeUrl ? youtubeThumbnail(ex.youtubeUrl) : null;
                return (
                  <button
                    key={ex.id}
                    onClick={() => linkExercise(ex)}
                    className="w-full flex items-center gap-2 p-2 hover:bg-neutral-50 rounded text-left"
                  >
                    {thumb ? (
                      <img src={thumb} alt="" className="w-12 h-8 object-cover rounded flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-8 bg-neutral-100 rounded flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{ex.name}</div>
                      <div className="text-xs text-neutral-500 truncate">
                        {ex.category}
                        {ex.tags && ` · ${ex.tags}`}
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredLibrary.length === 0 && (
                <p className="text-xs text-neutral-500 text-center py-4">
                  No hay más ejercicios{search ? " que coincidan" : ""}. Añade a tu biblioteca desde el panel del fisio.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
        <button onClick={onClose} className="btn btn-ghost text-sm">Cancelar</button>
        <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
          {saving ? "Guardando..." : "Guardar tarea"}
        </button>
      </div>
    </div>
  );
}
