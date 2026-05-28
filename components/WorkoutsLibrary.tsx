"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { youtubeThumbnail } from "@/lib/youtube";

type Exercise = {
  id: string;
  name: string;
  category: string;
  tags: string;
  youtubeUrl: string | null;
};
type Template = {
  id: string;
  title: string;
  bodyText: string;
  exerciseIds: string[];
  updatedAt: string;
};

export function WorkoutsLibrary({
  initial, exercises,
}: {
  initial: Template[];
  exercises: Exercise[];
}) {
  const router = useRouter();
  const [list, setList] = useState<Template[]>(initial);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);

  async function remove(id: string) {
    if (!confirm("¿Borrar esta plantilla?")) return;
    await fetch(`/api/library/workouts/${id}`, { method: "DELETE" });
    setList((a) => a.filter((t) => t.id !== id));
    router.refresh();
  }

  return (
    <div>
      <header className="mb-4 flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-lg">Workouts</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Plantillas de WOD reutilizables. Las puedes elegir al añadir un workout al calendario del paciente.
          </p>
        </div>
        {!creating && !editing && (
          <button onClick={() => setCreating(true)} className="btn btn-primary text-sm">
            + Nueva plantilla
          </button>
        )}
      </header>

      {(creating || editing) && (
        <TemplateEditor
          initial={editing}
          exercises={exercises}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSaved={(t) => {
            setList((a) => editing ? a.map((x) => x.id === t.id ? t : x) : [t, ...a]);
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {list.length === 0 && !creating ? (
        <p className="text-sm text-neutral-400 italic py-12 text-center card">
          Aún no hay plantillas. Crea la primera o márcalas como plantilla al guardar un workout dentro de un paciente.
        </p>
      ) : (
        <div className="space-y-2 mt-3">
          {list.map((t) => {
            const linked = exercises.filter((e) => t.exerciseIds.includes(e.id));
            return (
              <article key={t.id} className="card">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{t.title}</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">
                      Actualizado {new Date(t.updatedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                    {t.bodyText && (
                      <pre className="text-xs text-neutral-700 whitespace-pre-wrap font-mono bg-neutral-50 rounded-lg p-2 mt-2 line-clamp-4">{t.bodyText}</pre>
                    )}
                    {linked.length > 0 && (
                      <div className="text-[11px] text-neutral-500 mt-2">
                        🎥 Ejercicios vinculados: {linked.map((e) => e.name).join(", ")}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <button onClick={() => setEditing(t)} className="text-xs text-neutral-600 hover:text-neutral-900">✏️ Editar</button>
                    <button onClick={() => remove(t.id)} className="text-xs text-red-600">🗑️ Borrar</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({
  initial, exercises, onCancel, onSaved,
}: {
  initial: Template | null;
  exercises: Exercise[];
  onCancel: () => void;
  onSaved: (t: Template) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [bodyText, setBodyText] = useState(initial?.bodyText ?? "");
  const [linkedIds, setLinkedIds] = useState<string[]>(initial?.exerciseIds ?? []);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);

  const linked = exercises.filter((e) => linkedIds.includes(e.id));
  const filtered = exercises.filter((ex) => {
    if (linkedIds.includes(ex.id)) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return ex.name.toLowerCase().includes(s) || ex.tags.toLowerCase().includes(s) || ex.category.toLowerCase().includes(s);
  });

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const url = initial ? `/api/library/workouts/${initial.id}` : "/api/library/workouts";
    const method = initial ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), bodyText, exerciseIds: linkedIds }),
    });
    if (res.ok) {
      const t = await res.json();
      onSaved(t);
    }
    setSaving(false);
  }

  return (
    <div className="card mb-3 space-y-3">
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Título</label>
        <input className="input text-sm font-medium" value={title} onChange={(e) => setTitle(e.target.value)} placeholder='Ej: Movilidad de hombro 25 min' />
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Bloque del WOD</label>
        <textarea
          className="input font-mono text-sm"
          rows={10}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder={`A) Calentamiento (5 min)\n3 rondas:\n- 10 cat-camel\n- 10 wall slides\n\nB) Bloque principal (15 min)\nEMOM 10:\n- Par: 5 strict press @ 30 kg\n- Impar: 8 ring rows`}
        />
      </div>

      <div>
        <label className="text-xs text-neutral-500 block mb-2">Ejercicios vinculados (vídeos que verá el paciente)</label>
        <div className="space-y-1 mb-2">
          {linked.map((ex) => {
            const thumb = ex.youtubeUrl ? youtubeThumbnail(ex.youtubeUrl) : null;
            return (
              <div key={ex.id} className="flex items-center gap-2 p-2 bg-neutral-50 rounded-lg">
                {thumb ? <img src={thumb} alt="" className="w-16 h-10 object-cover rounded flex-shrink-0" /> : <div className="w-16 h-10 bg-neutral-200 rounded flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{ex.name}</div>
                  <div className="text-xs text-neutral-500 truncate">{ex.category}</div>
                </div>
                <button onClick={() => setLinkedIds((a) => a.filter((id) => id !== ex.id))} className="text-xs text-red-600 px-2">✕</button>
              </div>
            );
          })}
        </div>
        {!showSearch ? (
          <button onClick={() => setShowSearch(true)} className="btn btn-ghost text-xs w-full">+ Vincular ejercicio</button>
        ) : (
          <div className="border border-neutral-200 rounded-lg p-2">
            <div className="flex gap-2 mb-2">
              <input className="input text-sm" placeholder="🔍 Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
              <button onClick={() => setShowSearch(false)} className="text-xs text-neutral-500 px-2">Cerrar</button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filtered.slice(0, 20).map((ex) => (
                <button key={ex.id} onClick={() => setLinkedIds((a) => [...a, ex.id])} className="w-full flex items-center gap-2 p-2 hover:bg-neutral-50 rounded text-left">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{ex.name}</div>
                    <div className="text-xs text-neutral-500 truncate">{ex.category}{ex.tags && ` · ${ex.tags}`}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
        <button onClick={onCancel} className="btn btn-ghost text-sm">Cancelar</button>
        <button onClick={save} disabled={saving || !title.trim()} className="btn btn-primary text-sm">
          {saving ? "Guardando..." : initial ? "Guardar cambios" : "Crear plantilla"}
        </button>
      </div>
    </div>
  );
}
