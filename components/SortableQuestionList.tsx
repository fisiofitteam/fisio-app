"use client";

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type Question = {
  id: string;
  text: string;
  description?: string;
  type: "text" | "scale" | "yesno" | "choice" | "likert";
  min?: number;
  max?: number;
  options?: string[];
  // Solo si type === "likert": etiquetas para cada nivel de la escala (de
  // menos a más). Si no se rellenan, usa los defaults de 5 niveles.
  scaleLabels?: string[];
};

export const LIKERT_DEFAULT_5: string[] = [
  "Totalmente en desacuerdo",
  "En desacuerdo",
  "Neutral",
  "De acuerdo",
  "Totalmente de acuerdo",
];

export function SortableQuestionList({
  questions,
  onChange,
}: {
  questions: Question[];
  onChange: (next: Question[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(questions, oldIndex, newIndex));
  }

  function updateQuestion(id: string, changes: Partial<Question>) {
    onChange(questions.map((q) => (q.id === id ? { ...q, ...changes } : q)));
  }

  function removeQuestion(id: string) {
    onChange(questions.filter((q) => q.id !== id));
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd} collisionDetection={closestCenter}>
      <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {questions.map((q, i) => (
            <SortableQuestionItem
              key={q.id}
              question={q}
              index={i}
              onUpdate={(changes) => updateQuestion(q.id, changes)}
              onRemove={() => removeQuestion(q.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableQuestionItem({
  question,
  index,
  onUpdate,
  onRemove,
}: {
  question: Question;
  index: number;
  onUpdate: (changes: Partial<Question>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: question.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const q = question;

  return (
    <div ref={setNodeRef} style={style} className="border border-neutral-200 rounded-lg p-2 space-y-2 bg-white">
      <div className="flex gap-2 items-start">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-neutral-400 mt-1 select-none"
          title="Arrastrar para reordenar"
          type="button"
        >
          ⋮⋮
        </button>
        <span className="text-xs text-neutral-400 mt-2">{index + 1}.</span>
        <input
          className="input text-sm"
          placeholder="Texto de la pregunta"
          value={q.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
        />
        <button onClick={onRemove} className="text-xs text-red-600 px-1" type="button">✕</button>
      </div>
      <div className="pl-10">
        <input
          className="input text-xs italic"
          placeholder="Descripción / tutorial breve (opcional, en gris para el paciente)"
          value={q.description ?? ""}
          onChange={(e) => onUpdate({ description: e.target.value })}
        />
      </div>
      <div className="text-xs text-neutral-500 pl-10">
        Tipo: <strong>
          {q.type === "text" ? "Texto libre"
            : q.type === "scale" ? "Escala numérica"
            : q.type === "yesno" ? "Sí/No"
            : q.type === "likert" ? "Escala Likert"
            : "Opción múltiple"}
        </strong>
        {q.type === "scale" && <span> · {q.min} a {q.max}</span>}
        {q.type === "likert" && <span> · {(q.scaleLabels ?? LIKERT_DEFAULT_5).length} niveles</span>}
      </div>
      {q.type === "likert" && (
        <div className="pl-10 space-y-1">
          {(q.scaleLabels ?? LIKERT_DEFAULT_5).map((label, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <span className="text-[10px] text-neutral-400 w-4 text-right">{idx + 1}</span>
              <input
                className="input text-xs"
                value={label}
                onChange={(e) => {
                  const labels = [...(q.scaleLabels ?? LIKERT_DEFAULT_5)];
                  labels[idx] = e.target.value;
                  onUpdate({ scaleLabels: labels });
                }}
              />
              {(q.scaleLabels ?? LIKERT_DEFAULT_5).length > 2 && (
                <button
                  onClick={() => onUpdate({ scaleLabels: (q.scaleLabels ?? LIKERT_DEFAULT_5).filter((_, x) => x !== idx) })}
                  className="text-xs text-red-600 px-1"
                  type="button"
                  title="Quitar nivel"
                >✕</button>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={() => onUpdate({ scaleLabels: [...(q.scaleLabels ?? LIKERT_DEFAULT_5), "Nuevo nivel"] })}
              className="text-xs text-neutral-500"
              type="button"
            >
              + nivel
            </button>
            <button
              onClick={() => onUpdate({ scaleLabels: LIKERT_DEFAULT_5 })}
              className="text-xs text-neutral-400 hover:text-neutral-700"
              type="button"
              title="Restaurar etiquetas por defecto"
            >
              ↺ defaults 5 niveles
            </button>
          </div>
        </div>
      )}
      {q.type === "choice" && (
        <div className="pl-10 space-y-1">
          {(q.options ?? []).map((opt, idx) => (
            <div key={idx} className="flex gap-1">
              <input
                className="input text-xs"
                value={opt}
                onChange={(e) => {
                  const opts = [...(q.options ?? [])];
                  opts[idx] = e.target.value;
                  onUpdate({ options: opts });
                }}
              />
              <button
                onClick={() => onUpdate({ options: q.options?.filter((_, x) => x !== idx) })}
                className="text-xs text-red-600 px-1"
                type="button"
              >✕</button>
            </div>
          ))}
          <button
            onClick={() => onUpdate({ options: [...(q.options ?? []), "Opción"] })}
            className="text-xs text-neutral-500"
            type="button"
          >
            + opción
          </button>
        </div>
      )}
    </div>
  );
}
