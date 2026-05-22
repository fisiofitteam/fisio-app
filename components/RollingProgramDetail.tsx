"use client";

import Link from "next/link";
import { useState } from "react";

type Week = {
  id: string;
  weekStartDate: string;
  title: string | null;
  notes: string | null;
  contentJson: string;
  publishedAt: string | null;
};

type Program = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

function weekStartOfDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

function formatWeekLabel(iso: string): string {
  const d = new Date(iso);
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const startStr = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const endStr = end.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${startStr} – ${endStr}`;
}

export function RollingProgramDetail({
  program,
  weeks,
  patients,
  isManager,
}: {
  program: Program;
  weeks: Week[];
  patients: { id: string; fullName: string }[];
  isManager: boolean;
}) {
  const [editing, setEditing] = useState<Week | "new" | null>(null);
  const [archiving, setArchiving] = useState(false);

  const thisMonday = weekStartOfDate(new Date());
  const thisMondayIso = thisMonday.toISOString();

  // Buscar la semana actual (si existe)
  const currentWeek = weeks.find((w) => {
    const wIso = weekStartOfDate(new Date(w.weekStartDate)).toISOString();
    return wIso === thisMondayIso;
  });

  async function toggleArchive() {
    if (!isManager) return;
    if (!confirm(program.isActive ? `¿Archivar "${program.name}"? Los pacientes seguirán viéndolo pero no aparecerá como activo.` : `¿Reactivar "${program.name}"?`)) return;
    setArchiving(true);
    await fetch("/api/rolling-programs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: program.id, isActive: !program.isActive }),
    });
    window.location.reload();
  }

  return (
    <main>
      <header className="mb-5">
        <Link href="/fisio/rolling" className="text-xs text-neutral-500 hover:underline mb-2 inline-block">
          ← Volver a programas rolling
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              {program.name}
              {!program.isActive && (
                <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded" style={{ background: "#F5F5F5", color: "#737373" }}>
                  ARCHIVADO
                </span>
              )}
            </h1>
            {program.description && (
              <p className="text-sm text-neutral-500 mt-1">{program.description}</p>
            )}
            <div className="flex gap-3 text-xs text-neutral-500 mt-2">
              <span>{patients.length} {patients.length === 1 ? "paciente" : "pacientes"} activos</span>
              <span>·</span>
              <span>{weeks.length} {weeks.length === 1 ? "semana" : "semanas"} programada{weeks.length === 1 ? "" : "s"}</span>
            </div>
          </div>
          {isManager && (
            <button
              onClick={toggleArchive}
              disabled={archiving}
              className="text-xs px-3 py-1.5 rounded-md"
              style={{ background: "#FFFFFF", border: "1px solid #E5E5E5", color: "#525252" }}
            >
              {program.isActive ? "Archivar" : "Reactivar"}
            </button>
          )}
        </div>
      </header>

      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "#737373" }}>Semanas</h2>
          <button
            onClick={() => setEditing("new")}
            className="text-sm font-medium px-3 py-1.5 rounded-md"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            + Programar semana
          </button>
        </div>

        {!currentWeek && (
          <div className="rounded-xl px-4 py-3 mb-3" style={{ background: "#FEF3C7", border: "1px solid #FCD34D" }}>
            <div className="text-sm font-medium" style={{ color: "#7C2D12" }}>
              ⚠️ Sin contenido para esta semana ({formatWeekLabel(thisMondayIso)})
            </div>
            <div className="text-xs mt-1" style={{ color: "#92400E" }}>
              Los pacientes ven "Tu coach está preparando la semana". Programa el contenido.
            </div>
          </div>
        )}

        {weeks.length === 0 ? (
          <p className="text-sm text-neutral-500 italic text-center py-8">
            Aún no hay semanas programadas. Crea la primera con el botón de arriba.
          </p>
        ) : (
          <div className="space-y-2">
            {weeks.map((w) => {
              const wIso = weekStartOfDate(new Date(w.weekStartDate)).toISOString();
              const isCurrent = wIso === thisMondayIso;
              const isFuture = wIso > thisMondayIso;
              const isPast = wIso < thisMondayIso;
              return (
                <button
                  key={w.id}
                  onClick={() => setEditing(w)}
                  className="block w-full text-left rounded-xl px-4 py-3 hover:bg-neutral-50 transition"
                  style={{
                    background: isCurrent ? "#FEF3C7" : "#FFFFFF",
                    border: `1px solid ${isCurrent ? "#FCD34D" : "#E5E5E5"}`,
                    opacity: isPast ? 0.7 : 1,
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium" style={{ color: isCurrent ? "#7C2D12" : "#737373" }}>
                          {isCurrent ? "⏰ ESTA SEMANA · " : isFuture ? "PRÓXIMA · " : ""}
                          {formatWeekLabel(w.weekStartDate)}
                        </span>
                        {!w.publishedAt && (
                          <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#F5F5F5", color: "#737373" }}>
                            BORRADOR
                          </span>
                        )}
                      </div>
                      <div className="font-medium text-sm" style={{ letterSpacing: "-0.01em" }}>
                        {w.title || "Sin título"}
                      </div>
                    </div>
                    <span className="text-neutral-400">→</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {patients.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-medium uppercase tracking-wider mb-2" style={{ color: "#737373" }}>
            Pacientes en este programa
          </h2>
          <div className="rounded-xl px-4 py-3" style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {patients.map((p) => (
                <Link key={p.id} href={`/fisio/paciente/${p.id}/ficha`} className="text-sm hover:underline">
                  {p.fullName}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {editing && (
        <WeekEditor
          programId={program.id}
          week={editing === "new" ? null : editing}
          defaultDate={editing === "new" ? thisMondayIso : null}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}

function WeekEditor({
  programId,
  week,
  defaultDate,
  onClose,
}: {
  programId: string;
  week: Week | null;
  defaultDate: string | null;
  onClose: () => void;
}) {
  const initialDate = week
    ? new Date(week.weekStartDate).toISOString().split("T")[0]
    : defaultDate
    ? new Date(defaultDate).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  const [weekDate, setWeekDate] = useState(initialDate);
  const [title, setTitle] = useState(week?.title || "");
  const [notes, setNotes] = useState(week?.notes || "");
  const [content, setContent] = useState(() => {
    if (week?.contentJson && week.contentJson !== "{}") {
      try {
        const parsed = JSON.parse(week.contentJson);
        return parsed.markdown || "";
      } catch {
        return week.contentJson;
      }
    }
    return "";
  });
  const [saving, setSaving] = useState(false);

  async function save(publish: boolean) {
    setSaving(true);
    const contentJson = JSON.stringify({ markdown: content });
    await fetch("/api/rolling-weeks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programId,
        weekStartDate: new Date(weekDate).toISOString(),
        title: title.trim() || null,
        notes: notes.trim() || null,
        contentJson,
        publish,
      }),
    });
    window.location.reload();
  }

  async function remove() {
    if (!week) return;
    if (!confirm("¿Borrar esta semana? Los pacientes activos esa semana dejarán de ver el contenido.")) return;
    setSaving(true);
    await fetch(`/api/rolling-weeks?id=${week.id}`, { method: "DELETE" });
    window.location.reload();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">{week ? "Editar semana" : "Programar semana"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>

        <div className="space-y-3 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Lunes de la semana *</label>
              <input
                type="date"
                className="input text-sm w-full"
                value={weekDate}
                onChange={(e) => setWeekDate(e.target.value)}
                disabled={!!week}
              />
              {!week && (
                <p className="text-[10px] text-neutral-500 mt-1 italic">
                  Si no es lunes, lo ajustaremos al lunes de esa semana.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Título (opcional)</label>
              <input
                type="text"
                className="input text-sm w-full"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Foco fuerza"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Contenido de la semana</label>
            <textarea
              className="input text-sm w-full font-mono"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={14}
              placeholder={`Lunes - Fuerza
- Sentadilla 5x5 @ 80%
- Press banca 4x6
- ...

Martes - Skill
- Doble bajo 5x20
- ...`}
            />
            <p className="text-[10px] text-neutral-500 mt-1 italic">
              Escribe el contenido que verá el paciente. Acepta saltos de línea y formato libre.
            </p>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Notas internas (no visibles al paciente)</label>
            <textarea
              className="input text-sm w-full"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Recordatorios para ti..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            {week && (
              <button
                onClick={remove}
                disabled={saving}
                className="text-sm px-3 py-2 rounded-lg text-red-600 hover:bg-red-50"
              >
                Borrar
              </button>
            )}
            <button
              onClick={() => save(false)}
              disabled={saving}
              className="flex-1 text-sm px-3 py-2 rounded-lg"
              style={{ background: "#F5F5F5", color: "#0A0A0A" }}
            >
              Guardar borrador
            </button>
            <button
              onClick={() => save(true)}
              disabled={saving}
              className="flex-1 text-sm font-medium px-3 py-2 rounded-lg"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              {week?.publishedAt ? "Guardar cambios" : "Publicar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
