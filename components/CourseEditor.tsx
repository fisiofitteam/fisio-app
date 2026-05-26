"use client";

import { useState } from "react";
import Link from "next/link";
import { parseVideo } from "@/lib/video";
import {
  ChevronLeft, ChevronDown, ChevronRight, Plus, Trash2, Pencil, Film, Check, X,
} from "lucide-react";

type Lesson = { id: string; title: string; description: string | null; videoUrl: string };
type Section = { id: string; title: string; lessons: Lesson[] };
type Course = {
  id: string; title: string; description: string | null;
  coverUrl: string | null; published: boolean; sections: Section[];
};

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d?.error || "Error");
  }
  return res.status === 200 ? res.json() : null;
}

function VideoEmbed({ url }: { url: string }) {
  const info = parseVideo(url);
  if (!info.embedUrl) {
    return (
      <div className="aspect-video w-full rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-400 text-sm gap-2">
        <Film size={18} /> Enlace de vídeo no reconocido
      </div>
    );
  }
  return (
    <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
      <iframe src={info.embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
    </div>
  );
}

export function CourseEditor({ course: initial }: { course: Course }) {
  const [sections, setSections] = useState<Section[]>(initial.sections);
  const [selected, setSelected] = useState<string | null>(initial.sections[0]?.lessons[0]?.id ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);

  function fail(e: unknown) {
    setErr(e instanceof Error ? e.message : "Algo ha fallado");
    setTimeout(() => setErr(null), 4000);
  }

  const allLessons = sections.flatMap((s) => s.lessons);
  const selectedLesson = allLessons.find((l) => l.id === selected) ?? null;

  function updateLesson(u: Lesson) {
    setSections((arr) => arr.map((s) => ({ ...s, lessons: s.lessons.map((l) => (l.id === u.id ? u : l)) })));
  }
  function removeLesson(id: string) {
    setSections((arr) => arr.map((s) => ({ ...s, lessons: s.lessons.filter((l) => l.id !== id) })));
    if (selected === id) setSelected(null);
  }

  return (
    <div>
      <Link href="/fisio/comunidad" className="text-sm text-neutral-500 hover:text-neutral-900 flex items-center gap-1 mb-3">
        <ChevronLeft size={15} /> Volver a Comunidad
      </Link>

      <header className="mb-4">
        <h1 className="text-xl font-semibold">{initial.title}</h1>
        {initial.description && <p className="text-sm text-neutral-500 mt-0.5">{initial.description}</p>}
      </header>

      {err && <div className="mb-3 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700 border border-red-200">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-5">
        {/* Sidebar: secciones + lecciones */}
        <div className="space-y-2">
          {sections.map((s) => (
            <SectionBlock
              key={s.id}
              section={s}
              selectedLessonId={selected}
              onSelectLesson={setSelected}
              onChangeSection={(u) => setSections((arr) => arr.map((x) => (x.id === s.id ? u : x)))}
              onDeleteSection={() => setSections((arr) => arr.filter((x) => x.id !== s.id))}
              fail={fail}
            />
          ))}

          {addingSection ? (
            <InlineForm
              placeholder="Nombre de la sección"
              onCancel={() => setAddingSection(false)}
              onSave={async (title) => {
                try {
                  const created = await api("/api/community/sections", "POST", { moduleId: initial.id, title });
                  setSections((a) => [...a, { id: created.id, title: created.title, lessons: [] }]);
                  setAddingSection(false);
                } catch (e) { fail(e); }
              }}
            />
          ) : (
            <button onClick={() => setAddingSection(true)} className="w-full text-sm text-neutral-600 hover:text-neutral-900 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-neutral-300 hover:border-neutral-400">
              <Plus size={15} /> Añadir sección
            </button>
          )}
        </div>

        {/* Panel derecho: lección seleccionada */}
        <div>
          {selectedLesson ? (
            <LessonDetail
              key={selectedLesson.id}
              lesson={selectedLesson}
              onChange={updateLesson}
              onDelete={() => removeLesson(selectedLesson.id)}
              fail={fail}
            />
          ) : (
            <div className="card text-center text-sm text-neutral-400 py-16">
              Selecciona una lección a la izquierda, o añade una nueva dentro de una sección.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionBlock({
  section, selectedLessonId, onSelectLesson, onChangeSection, onDeleteSection, fail,
}: {
  section: Section;
  selectedLessonId: string | null;
  onSelectLesson: (id: string) => void;
  onChangeSection: (s: Section) => void;
  onDeleteSection: () => void;
  fail: (e: unknown) => void;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingLesson, setAddingLesson] = useState(false);

  async function rename(title: string) {
    try { await api(`/api/community/sections/${section.id}`, "PATCH", { title }); onChangeSection({ ...section, title }); setEditing(false); }
    catch (e) { fail(e); }
  }
  async function remove() {
    if (!confirm(`¿Borrar la sección "${section.title}" y sus lecciones?`)) return;
    try { await api(`/api/community/sections/${section.id}`, "DELETE"); onDeleteSection(); }
    catch (e) { fail(e); }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      {editing ? (
        <div className="p-2">
          <InlineForm initialValue={section.title} placeholder="Nombre de la sección" onCancel={() => setEditing(false)} onSave={rename} />
        </div>
      ) : (
        <div className="flex items-center gap-1 px-2 py-2">
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 flex-1 text-left font-medium text-sm">
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <span className="truncate">{section.title}</span>
            <span className="text-xs text-neutral-400 font-normal">({section.lessons.length})</span>
          </button>
          <button title="Renombrar" onClick={() => setEditing(true)} className="p-1 text-neutral-400 hover:text-neutral-900"><Pencil size={13} /></button>
          <button title="Borrar sección" onClick={remove} className="p-1 text-neutral-400 hover:text-red-600"><Trash2 size={13} /></button>
        </div>
      )}

      {open && !editing && (
        <div className="px-2 pb-2 space-y-0.5">
          {section.lessons.map((l) => (
            <button
              key={l.id}
              onClick={() => onSelectLesson(l.id)}
              className={`w-full text-left text-sm px-3 py-1.5 rounded-md truncate transition-colors ${
                selectedLessonId === l.id ? "bg-amber-100 text-neutral-900 font-medium" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {l.title}
            </button>
          ))}

          {addingLesson ? (
            <div className="pt-1">
              <LessonCreateForm
                onCancel={() => setAddingLesson(false)}
                onSave={async (data) => {
                  try {
                    const created = await api("/api/community/lessons", "POST", { ...data, sectionId: section.id });
                    onChangeSection({ ...section, lessons: [...section.lessons, created] });
                    onSelectLesson(created.id);
                    setAddingLesson(false);
                  } catch (e) { fail(e); }
                }}
              />
            </div>
          ) : (
            <button onClick={() => setAddingLesson(true)} className="w-full text-xs text-neutral-500 hover:text-neutral-900 flex items-center gap-1 px-3 py-1.5">
              <Plus size={13} /> Añadir lección
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LessonDetail({
  lesson, onChange, onDelete, fail,
}: {
  lesson: Lesson;
  onChange: (l: Lesson) => void;
  onDelete: () => void;
  fail: (e: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);

  async function remove() {
    if (!confirm(`¿Borrar la lección "${lesson.title}"?`)) return;
    try { await api(`/api/community/lessons/${lesson.id}`, "DELETE"); onDelete(); }
    catch (e) { fail(e); }
  }

  if (editing) {
    return (
      <div className="card">
        <LessonCreateForm
          initial={lesson}
          submitLabel="Guardar"
          onCancel={() => setEditing(false)}
          onSave={async (data) => {
            try { await api(`/api/community/lessons/${lesson.id}`, "PATCH", data); onChange({ ...lesson, ...data }); setEditing(false); }
            catch (e) { fail(e); }
          }}
        />
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-2">
        <h2 className="text-lg font-semibold flex-1">{lesson.title}</h2>
        <button title="Editar" onClick={() => setEditing(true)} className="p-1.5 text-neutral-400 hover:text-neutral-900"><Pencil size={16} /></button>
        <button title="Borrar" onClick={remove} className="p-1.5 text-neutral-400 hover:text-red-600"><Trash2 size={16} /></button>
      </div>
      <VideoEmbed url={lesson.videoUrl} />
      {lesson.description && <p className="text-sm text-neutral-700 whitespace-pre-line">{lesson.description}</p>}
    </div>
  );
}

function LessonCreateForm({
  initial, submitLabel = "Añadir", onSave, onCancel,
}: {
  initial?: Lesson;
  submitLabel?: string;
  onSave: (data: { title: string; videoUrl: string; description: string | null }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  return (
    <div className="space-y-2">
      <input className="input text-sm" placeholder="Título de la lección" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className="input text-sm" placeholder="Enlace YouTube o Vimeo" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
      <textarea className="input text-sm" rows={3} placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn text-sm">Cancelar</button>
        <button
          onClick={() => title.trim() && videoUrl.trim() && onSave({ title: title.trim(), videoUrl: videoUrl.trim(), description: description.trim() || null })}
          className="btn btn-primary text-sm"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function InlineForm({
  initialValue = "", placeholder, onSave, onCancel,
}: {
  initialValue?: string;
  placeholder: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        className="input text-sm flex-1"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) onSave(value.trim()); if (e.key === "Escape") onCancel(); }}
      />
      <button title="Guardar" onClick={() => value.trim() && onSave(value.trim())} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md"><Check size={16} /></button>
      <button title="Cancelar" onClick={onCancel} className="p-1.5 text-neutral-400 hover:bg-neutral-100 rounded-md"><X size={16} /></button>
    </div>
  );
}
