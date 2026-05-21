"use client";

import { useEffect, useState } from "react";
import { SortableQuestionList, Question } from "../SortableQuestionList";

type LibForm = { id: string; name: string; description: string | null; questions: string };

export function FormTaskEditor({ task, onClose, onSave }: { task: any; onClose: () => void; onSave?: (snapshot: any) => void }) {
  const [title, setTitle] = useState(task.title);
  const [questions, setQuestions] = useState<Question[]>(
    task.form?.questions ? JSON.parse(task.form.questions) :
    (typeof task.questions === "string" ? JSON.parse(task.questions) : task.questions ?? [])
  );
  const [saving, setSaving] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [library, setLibrary] = useState<LibForm[]>([]);

  useEffect(() => {
    if (showLibrary) {
      fetch("/api/library/forms").then((r) => r.json()).then(setLibrary);
    }
  }, [showLibrary]);

  function importForm(f: LibForm) {
    setTitle(f.name);
    setQuestions(JSON.parse(f.questions));
    setShowLibrary(false);
  }

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
    setSaving(true);
    if (onSave) {
      onSave({ ...task, title, questions: JSON.stringify(questions) });
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
        form: { questions },
      }),
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="space-y-3">
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-900">
        📝 Formulario · diseña preguntas para el paciente
      </div>

      <button
        onClick={() => setShowLibrary(!showLibrary)}
        className="btn btn-ghost text-xs w-full"
      >
        {showLibrary ? "Cerrar biblioteca" : "📚 Importar de biblioteca"}
      </button>

      {showLibrary && (
        <div className="border border-neutral-200 rounded-lg p-2">
          <div className="max-h-60 overflow-y-auto space-y-1">
            {library.length === 0 ? (
              <p className="text-xs text-neutral-500 text-center py-4">
                No hay formularios en biblioteca.
              </p>
            ) : (
              library.map((f) => {
                const qs = JSON.parse(f.questions);
                return (
                  <button
                    key={f.id}
                    onClick={() => importForm(f)}
                    className="w-full text-left p-2 hover:bg-neutral-50 rounded"
                  >
                    <div className="text-sm font-medium">{f.name}</div>
                    {f.description && <div className="text-xs text-neutral-500 truncate">{f.description}</div>}
                    <div className="text-xs text-neutral-400">{qs.length} pregunta{qs.length !== 1 && "s"}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      <div>
        <label className="text-xs text-neutral-500 block mb-1">Título</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <label className="text-xs text-neutral-500 block mb-2">Preguntas</label>
        {questions.length === 0 ? (
          <p className="text-xs text-neutral-400 italic text-center py-4">
            Sin preguntas. Añade alguna debajo.
          </p>
        ) : (
          <SortableQuestionList questions={questions} onChange={setQuestions} />
        )}

        <div className="flex gap-2 mt-2 flex-wrap">
          <button onClick={() => addQuestion("text")} className="btn btn-ghost text-xs">+ Texto libre</button>
          <button onClick={() => addQuestion("scale")} className="btn btn-ghost text-xs">+ Escala (0-10)</button>
          <button onClick={() => addQuestion("yesno")} className="btn btn-ghost text-xs">+ Sí/No</button>
          <button onClick={() => addQuestion("choice")} className="btn btn-ghost text-xs">+ Opción múltiple</button>
        </div>
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
