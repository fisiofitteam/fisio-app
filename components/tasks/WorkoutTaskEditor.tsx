"use client";

import { useEffect, useState } from "react";
import { youtubeThumbnail } from "@/lib/youtube";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Template = { id: string; title: string; bodyText: string; exerciseIds: string[] };

export function WorkoutTaskEditor({ task, onClose, onSave }: { task: any; onClose: () => void; onSave?: (snapshot: any) => void }) {
  const [title, setTitle] = useState(task.title);
  const [bodyText, setBodyText] = useState(task.workout?.bodyText ?? task.bodyText ?? "");
  // Soporta 3 formas de leer ejercicios:
  //   - task.workout.exercises[].exercise (modo BD)
  //   - task.exercises[]                  (snapshot moderno)
  //   - task.linkedExercises[]            (snapshot legacy, mantenido por compat)
  const [linkedExercises, setLinkedExercises] = useState<any[]>(
    task.workout?.exercises?.map((we: any) => we.exercise)
      ?? task.exercises
      ?? task.linkedExercises
      ?? []
  );
  const [library, setLibrary] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  // Plantillas de workout de la biblioteca
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  // Buscador de plantillas: input libre + dropdown filtrado. Con 20+
  // plantillas el select nativo era imposible de escanear.
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);

  useEffect(() => {
    fetch("/api/library").then((r) => r.json()).then(setLibrary);
    fetch("/api/library/workouts").then((r) => r.json()).then((arr: Template[]) => setTemplates(arr || []));
  }, []);

  // Cargar valores de una plantilla seleccionada en el form actual.
  function loadTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (bodyText.trim() && !confirm("Esto sobrescribirá lo que tengas ahora. ¿Continuar?")) return;
    setTitle(t.title);
    setBodyText(t.bodyText);
    // Recuperar ejercicios vinculados desde la library en memoria
    const exs = library.filter((e: any) => t.exerciseIds.includes(e.id));
    setLinkedExercises(exs);
    setTemplateSearch("");
    setTemplateOpen(false);
  }

  const filteredTemplates = templates.filter((t) => {
    if (!templateSearch) return true;
    return t.title.toLowerCase().includes(templateSearch.toLowerCase());
  });

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

  // ── Drag & drop para reordenar vídeos vinculados ─────────────────────
  // Usamos PointerSensor + TouchSensor con un delay corto para no
  // interferir con los taps en mobile. Activamos por un pequeño umbral
  // de distancia para que un click en la X de borrar no inicie un drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLinkedExercises((prev) => {
      const oldIdx = prev.findIndex((x) => x.id === active.id);
      const newIdx = prev.findIndex((x) => x.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  }

  async function save() {
    setSaving(true);
    // Si está marcado, guardamos la plantilla en biblioteca antes de seguir.
    if (saveAsTemplate && title.trim()) {
      try {
        await fetch("/api/library/workouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            bodyText,
            exerciseIds: linkedExercises.map((e) => e.id),
          }),
        });
      } catch {}
    }
    // Modo snapshot: devuelve el task actualizado por callback. Emitimos
    // `exercises` con el shape plano que espera SessionRunner (lo que generamos
    // en generateSessions). Limpiamos cualquier `linkedExercises` legacy para
    // que el snapshot quede normalizado.
    if (onSave) {
      const { linkedExercises: _legacy, ...rest } = task;
      onSave({
        ...rest,
        title,
        bodyText,
        exercises: linkedExercises.map((ex: any) => ({
          id: ex.id,
          name: ex.name,
          category: ex.category,
          youtubeUrl: ex.youtubeUrl ?? null,
          description: ex.description ?? null,
        })),
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

      {/* Buscador de plantillas de la biblioteca. Substituye al select
          nativo: con 20+ plantillas era casi imposible escanear. */}
      {templates.length > 0 && (
        <div className="relative">
          <label className="text-xs text-neutral-500 block mb-1">
            Cargar de plantilla (opcional) · <span className="text-neutral-400">{templates.length} disponibles</span>
          </label>
          <div className="relative">
            <input
              className="input text-sm pr-8"
              placeholder="🔍 Buscar plantilla por nombre..."
              value={templateSearch}
              onChange={(e) => { setTemplateSearch(e.target.value); setTemplateOpen(true); }}
              onFocus={() => setTemplateOpen(true)}
              onBlur={() => setTimeout(() => setTemplateOpen(false), 150)}
            />
            {templateSearch && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setTemplateSearch(""); setTemplateOpen(true); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-sm leading-none px-1"
                aria-label="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>
          {templateOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {filteredTemplates.length === 0 ? (
                <div className="px-3 py-3 text-xs text-neutral-500 italic text-center">
                  Sin resultados para "{templateSearch}"
                </div>
              ) : (
                filteredTemplates.slice(0, 30).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => loadTemplate(t.id)}
                    className="w-full text-left px-3 py-2 hover:bg-neutral-50 border-b border-neutral-100 last:border-b-0"
                  >
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    {t.bodyText && (
                      <div className="text-[11px] text-neutral-500 truncate mt-0.5">
                        {t.bodyText.split("\n")[0]}
                      </div>
                    )}
                  </button>
                ))
              )}
              {filteredTemplates.length > 30 && (
                <div className="px-3 py-2 text-[11px] text-neutral-400 italic border-t border-neutral-100 text-center">
                  Mostrando 30 de {filteredTemplates.length} · refina la búsqueda
                </div>
              )}
            </div>
          )}
        </div>
      )}

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

        {linkedExercises.length > 1 && (
          <p className="text-[10px] text-neutral-400 mb-1">
            Arrastra ⠿ para reordenar los vídeos. El paciente los verá en este orden.
          </p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={linkedExercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1 mb-2">
              {linkedExercises.map((ex) => (
                <SortableExerciseRow key={ex.id} exercise={ex} onUnlink={() => unlinkExercise(ex.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

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

      {/* Guardar también como plantilla en la biblioteca */}
      <label className="flex items-center gap-2 text-xs cursor-pointer pt-2">
        <input type="checkbox" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} className="w-4 h-4 accent-neutral-900" />
        💾 Guardar también como plantilla en la biblioteca
      </label>

      <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
        <button onClick={onClose} className="btn btn-ghost text-sm">Cancelar</button>
        <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
          {saving ? "Guardando..." : "Guardar tarea"}
        </button>
      </div>
    </div>
  );
}

/**
 * Una fila de ejercicio vinculado, draggable. El ⠿ es el único handle:
 * el resto de la fila no inicia drag, así el botón de borrar sigue siendo
 * clickable sin confusión.
 */
function SortableExerciseRow({ exercise, onUnlink }: { exercise: any; onUnlink: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: exercise.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const thumb = exercise.youtubeUrl ? youtubeThumbnail(exercise.youtubeUrl) : null;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 bg-neutral-50 rounded-lg"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-neutral-400 hover:text-neutral-700 cursor-grab active:cursor-grabbing select-none px-1 leading-none touch-none"
        title="Arrastrar para reordenar"
        aria-label="Arrastrar para reordenar"
      >
        ⠿
      </button>
      {thumb ? (
        <img src={thumb} alt="" className="w-16 h-10 object-cover rounded flex-shrink-0" />
      ) : (
        <div className="w-16 h-10 bg-neutral-200 rounded flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{exercise.name}</div>
        <div className="text-xs text-neutral-500 truncate">{exercise.category}</div>
      </div>
      <button onClick={onUnlink} className="text-xs text-red-600 px-2">✕</button>
    </div>
  );
}
