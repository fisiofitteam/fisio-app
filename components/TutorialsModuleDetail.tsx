"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type LessonItem = {
  id: string;
  title: string;
  description: string;
  videoUrl: string | null;
  attachmentsCount: number;
};

type SectionItem = {
  id: string;
  title: string;
  lessons: LessonItem[];
};

export function TutorialsModuleDetail({
  moduleId,
  canManage,
  sections,
}: {
  moduleId: string;
  canManage: boolean;
  sections: SectionItem[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  async function addSection() {
    if (!newTitle.trim()) return;
    await fetch("/api/training/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleId, title: newTitle.trim() }),
    });
    setNewTitle("");
    setAdding(false);
    router.refresh();
  }

  async function deleteSection(id: string) {
    if (!confirm("¿Eliminar esta sección? Se perderán todas sus lecciones.")) return;
    await fetch(`/api/training/sections?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {sections.length === 0 && (
        <p className="text-sm text-neutral-500 text-center py-8 italic">
          Este módulo aún no tiene secciones.{canManage ? " Crea la primera abajo." : ""}
        </p>
      )}
      {sections.map((s) => (
        <SectionCard
          key={s.id}
          section={s}
          canManage={canManage}
          onDelete={() => deleteSection(s.id)}
          moduleId={moduleId}
        />
      ))}

      {canManage && (
        adding ? (
          <div className="card !p-3 flex gap-2 items-center">
            <input
              className="input flex-1 text-sm"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Título de la sección"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && addSection()}
            />
            <button onClick={addSection} className="btn btn-primary text-xs">Crear</button>
            <button onClick={() => { setAdding(false); setNewTitle(""); }} className="text-xs text-neutral-500">Cancelar</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="btn btn-primary text-xs">+ Nueva sección</button>
        )
      )}
    </div>
  );
}

function SectionCard({
  section,
  canManage,
  onDelete,
  moduleId,
}: {
  section: SectionItem;
  canManage: boolean;
  onDelete: () => void;
  moduleId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [addingLesson, setAddingLesson] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState("");

  async function saveSection() {
    if (!title.trim() || title === section.title) { setEditing(false); return; }
    await fetch("/api/training/sections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: section.id, title: title.trim() }),
    });
    setEditing(false);
    router.refresh();
  }

  async function addLesson() {
    if (!newLessonTitle.trim()) return;
    const r = await fetch("/api/training/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId: section.id, title: newLessonTitle.trim() }),
    });
    if (r.ok) {
      const { id } = await r.json();
      router.push(`/fisio/recursos/tutoriales/${moduleId}/leccion/${id}`);
    }
  }

  return (
    <section className="card !p-0">
      <header className="px-3 py-2 border-b border-neutral-100 flex items-center gap-2">
        {editing ? (
          <>
            <input className="input text-sm flex-1" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && saveSection()} />
            <button onClick={saveSection} className="text-xs text-neutral-700">Guardar</button>
            <button onClick={() => { setTitle(section.title); setEditing(false); }} className="text-xs text-neutral-500">Cancelar</button>
          </>
        ) : (
          <>
            <h2 className="font-medium text-sm flex-1">{section.title}</h2>
            <span className="text-xs text-neutral-400">{section.lessons.length} lección{section.lessons.length !== 1 && "es"}</span>
            {canManage && (
              <>
                <button onClick={() => setEditing(true)} className="text-xs text-neutral-500">Editar</button>
                <button onClick={onDelete} className="text-xs text-red-600">Borrar</button>
              </>
            )}
          </>
        )}
      </header>

      <div className="divide-y divide-neutral-100">
        {section.lessons.length === 0 && !addingLesson && (
          <p className="text-xs text-neutral-400 italic px-3 py-3">Aún no hay lecciones.</p>
        )}
        {section.lessons.map((l) => (
          <Link
            key={l.id}
            href={`/fisio/recursos/tutoriales/${moduleId}/leccion/${l.id}`}
            className="block px-3 py-2.5 hover:bg-neutral-50"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{l.videoUrl ? "🎥" : "📄"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{l.title}</div>
                {l.description && (
                  <div className="text-xs text-neutral-500 truncate">{l.description}</div>
                )}
              </div>
              {l.attachmentsCount > 0 && (
                <span className="text-[10px] text-neutral-400">📎 {l.attachmentsCount}</span>
              )}
            </div>
          </Link>
        ))}

        {canManage && (
          <div className="px-3 py-2">
            {addingLesson ? (
              <div className="flex gap-2 items-center">
                <input
                  className="input flex-1 text-sm"
                  value={newLessonTitle}
                  onChange={(e) => setNewLessonTitle(e.target.value)}
                  placeholder="Título de la lección"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && addLesson()}
                />
                <button onClick={addLesson} className="btn btn-primary text-xs">Crear y editar</button>
                <button onClick={() => { setAddingLesson(false); setNewLessonTitle(""); }} className="text-xs text-neutral-500">Cancelar</button>
              </div>
            ) : (
              <button onClick={() => setAddingLesson(true)} className="text-xs text-neutral-500 hover:text-neutral-900">
                + Nueva lección
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
