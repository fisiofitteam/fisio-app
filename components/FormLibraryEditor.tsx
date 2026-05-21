"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SortableQuestionList, Question } from "./SortableQuestionList";

type FormData = {
  id: string;
  name: string;
  description: string;
  questions: Question[];
};

export function FormLibraryEditor({ form }: { form: FormData | null }) {
  const router = useRouter();
  const [name, setName] = useState(form?.name ?? "");
  const [description, setDescription] = useState(form?.description ?? "");
  const [questions, setQuestions] = useState<Question[]>(form?.questions ?? []);
  const [saving, setSaving] = useState(false);

  function addQuestion(type: Question["type"]) {
    const q: Question = {
      id: `q_${Date.now()}`,
      text: "",
      type,
      ...(type === "scale" ? { min: 0, max: 10 } : {}),
      ...(type === "choice" ? { options: ["Opción 1", "Opción 2"] } : {}),
    };
    setQuestions((prev) => [...prev, q]);
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const method = form ? "PATCH" : "POST";
    const body = JSON.stringify({ ...(form && { id: form.id }), name, description, questions });
    await fetch("/api/library/forms", { method, headers: { "Content-Type": "application/json" }, body });
    router.push("/fisio/biblioteca/formularios");
    router.refresh();
  }

  async function remove() {
    if (!form) return;
    if (!confirm("¿Eliminar este formulario? Las tareas que lo usen no se ven afectadas (tienen su propio snapshot).")) return;
    await fetch(`/api/library/forms?id=${form.id}`, { method: "DELETE" });
    router.push("/fisio/biblioteca/formularios");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cuestionario semanal, Anamnesis de hombro..." autoFocus={!form} />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Descripción (opcional)</label>
          <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <h3 className="font-medium text-sm mb-3">Preguntas</h3>
        {questions.length === 0 ? (
          <p className="text-xs text-neutral-400 italic text-center py-4">
            Sin preguntas todavía. Añade alguna debajo.
          </p>
        ) : (
          <SortableQuestionList questions={questions} onChange={setQuestions} />
        )}
        <div className="flex gap-2 mt-3 flex-wrap">
          <button onClick={() => addQuestion("text")} className="btn btn-ghost text-xs">+ Texto libre</button>
          <button onClick={() => addQuestion("scale")} className="btn btn-ghost text-xs">+ Escala</button>
          <button onClick={() => addQuestion("yesno")} className="btn btn-ghost text-xs">+ Sí/No</button>
          <button onClick={() => addQuestion("choice")} className="btn btn-ghost text-xs">+ Opción múltiple</button>
        </div>
      </div>

      <div className="flex justify-between">
        {form ? <button onClick={remove} className="text-xs text-red-600">Eliminar</button> : <span />}
        <button onClick={save} disabled={!name.trim() || saving} className="btn btn-primary">
          {saving ? "Guardando..." : form ? "Guardar cambios" : "Crear formulario"}
        </button>
      </div>
    </div>
  );
}
