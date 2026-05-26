"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { parseVideo } from "@/lib/video";
import { Check, ChevronDown, ChevronRight, Film, CheckCircle2, Circle } from "lucide-react";

type Lesson = { id: string; title: string; description: string | null; videoUrl: string; done: boolean };
type Section = { id: string; title: string; lessons: Lesson[] };
type Course = { id: string; title: string; description: string | null; sections: Section[] };

function VideoEmbed({ url }: { url: string }) {
  const info = parseVideo(url);
  if (!info.embedUrl) {
    return (
      <div className="aspect-video w-full rounded-xl flex items-center justify-center gap-2 text-sm" style={{ background: "rgba(255,255,255,0.06)", color: "#737373" }}>
        <Film size={18} /> Vídeo no disponible
      </div>
    );
  }
  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
      <iframe src={info.embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
    </div>
  );
}

export function PatientCourse({ patientId, course }: { patientId: string; course: Course }) {
  const allLessons = useMemo(() => course.sections.flatMap((s) => s.lessons), [course]);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set(allLessons.filter((l) => l.done).map((l) => l.id)));
  const [selectedId, setSelectedId] = useState<string | null>(allLessons[0]?.id ?? null);

  const selected = allLessons.find((l) => l.id === selectedId) ?? null;
  const total = allLessons.length;
  const done = allLessons.filter((l) => doneIds.has(l.id)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  async function toggleDone(lessonId: string) {
    const wasDone = doneIds.has(lessonId);
    // optimista
    setDoneIds((s) => { const n = new Set(s); if (wasDone) n.delete(lessonId); else n.add(lessonId); return n; });
    try {
      const r = await fetch(`/api/community/lessons/${lessonId}/complete`, { method: "POST" });
      const d = await r.json();
      setDoneIds((s) => { const n = new Set(s); if (d.completed) n.add(lessonId); else n.delete(lessonId); return n; });
    } catch {
      setDoneIds((s) => { const n = new Set(s); if (wasDone) n.add(lessonId); else n.delete(lessonId); return n; }); // revertir
    }
  }

  return (
    <main className="min-h-screen text-white" style={{ color: "#FAFAFA" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        <header className="mb-4">
          <Link href={`/paciente/${patientId}/comunidad`} className="text-xs" style={{ color: "#737373" }}>← Comunidad</Link>
          <h1 className="text-xl font-bold mt-1" style={{ letterSpacing: "-0.025em" }}>{course.title}</h1>
          {course.description && <p className="text-sm mt-1" style={{ color: "#A3A3A3" }}>{course.description}</p>}
          <div className="mt-3">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #FCD34D, #F59E0B)" }} />
            </div>
            <div className="text-[11px] mt-1" style={{ color: "#737373" }}>{pct}% completado · {done}/{total} lecciones</div>
          </div>
        </header>

        {/* Reproductor de la lección seleccionada */}
        {selected && (
          <div className="mb-5">
            <VideoEmbed url={selected.videoUrl} />
            <div className="flex items-start gap-2 mt-3">
              <h2 className="text-base font-semibold flex-1" style={{ letterSpacing: "-0.015em" }}>{selected.title}</h2>
              <button
                onClick={() => toggleDone(selected.id)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 flex-shrink-0"
                style={doneIds.has(selected.id)
                  ? { background: "rgba(34,197,94,0.15)", color: "#86EFAC", border: "1px solid rgba(34,197,94,0.3)" }
                  : { background: "#FCD34D", color: "#0A0A0A" }}
              >
                <Check size={14} /> {doneIds.has(selected.id) ? "Completada" : "Marcar completada"}
              </button>
            </div>
            {selected.description && <p className="text-sm mt-2 whitespace-pre-line" style={{ color: "#D4D4D4" }}>{selected.description}</p>}
          </div>
        )}

        {/* Índice de secciones y lecciones */}
        <div className="space-y-2">
          {course.sections.map((s) => (
            <SectionAccordion
              key={s.id}
              section={s}
              doneIds={doneIds}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function SectionAccordion({
  section, doneIds, selectedId, onSelect,
}: {
  section: Section;
  doneIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const doneCount = section.lessons.filter((l) => doneIds.has(l.id)).length;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-3 py-3 text-left">
        {open ? <ChevronDown size={16} style={{ color: "#737373" }} /> : <ChevronRight size={16} style={{ color: "#737373" }} />}
        <span className="font-medium text-sm flex-1">{section.title}</span>
        <span className="text-[11px]" style={{ color: "#737373" }}>{doneCount}/{section.lessons.length}</span>
      </button>
      {open && (
        <div className="pb-1">
          {section.lessons.map((l) => {
            const isDone = doneIds.has(l.id);
            const isSel = selectedId === l.id;
            return (
              <button
                key={l.id}
                onClick={() => onSelect(l.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
                style={isSel ? { background: "rgba(252,211,77,0.12)" } : undefined}
              >
                {isDone
                  ? <CheckCircle2 size={16} style={{ color: "#86EFAC" }} className="flex-shrink-0" />
                  : <Circle size={16} style={{ color: "#525252" }} className="flex-shrink-0" />}
                <span className="text-sm truncate" style={{ color: isSel ? "#FCD34D" : "#D4D4D4", fontWeight: isSel ? 600 : 400 }}>{l.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
