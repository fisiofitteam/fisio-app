"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Edit2, Calendar, CheckCircle2 } from "lucide-react";
import type { MeetingCategory } from "@/lib/team-meetings";

type Meeting = {
  id: string;
  category: string;
  title: string;
  scheduledAt: string | null;
  preparation: string | null;
  summary: string | null;
  status: string;
  attendeeIds: string[];
};

type ProfessionalLite = { id: string; fullName: string; role: string };

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  upcoming: { label: "Próxima", color: "#1E40AF", bg: "#DBEAFE" },
  done: { label: "Hecha", color: "#065F46", bg: "#D1FAE5" },
  cancelled: { label: "Cancelada", color: "#525252", bg: "#F5F5F5" },
};

const ROLE_LABEL: Record<string, string> = {
  ceo: "👑 CEO",
  head_success: "⭐ Head Success",
  setter: "📞 Setter",
  closer: "🎯 Closer",
  fisio: "🩺 Fisio",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function TeamMeetingsList({
  category,
  meetings,
  professionals,
  canManage,
}: {
  category: MeetingCategory;
  meetings: Meeting[];
  professionals: ProfessionalLite[];
  /** El usuario actual puede crear/editar/borrar reuniones de esta categoría. */
  canManage: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm("¿Borrar esta reunión? Se pierde la preparación y el resumen.")) return;
    await fetch(`/api/team-meetings/${id}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  async function changeStatus(id: string, status: string) {
    await fetch(`/api/team-meetings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {canManage && !creating && (
        <div className="flex justify-end">
          <button
            onClick={() => setCreating(true)}
            className="text-sm font-medium px-3 py-1.5 rounded-lg flex items-center gap-1"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            <Plus size={13} /> Nueva reunión
          </button>
        </div>
      )}

      {creating && (
        <MeetingForm
          category={category}
          professionals={professionals}
          onCancel={() => setCreating(false)}
          onSaved={() => { setCreating(false); router.refresh(); }}
        />
      )}

      {meetings.length === 0 && !creating ? (
        <p className="text-sm text-neutral-400 italic text-center py-8 card">
          Aún no hay reuniones en esta categoría.
        </p>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) =>
            editing === m.id ? (
              <MeetingForm
                key={m.id}
                category={category}
                professionals={professionals}
                meeting={m}
                onCancel={() => setEditing(null)}
                onSaved={() => { setEditing(null); router.refresh(); }}
              />
            ) : (
              <MeetingCard
                key={m.id}
                meeting={m}
                professionals={professionals}
                canManage={canManage}
                onEdit={() => setEditing(m.id)}
                onRemove={() => remove(m.id)}
                onChangeStatus={(s) => changeStatus(m.id, s)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function MeetingCard({
  meeting,
  professionals,
  canManage,
  onEdit,
  onRemove,
  onChangeStatus,
}: {
  meeting: Meeting;
  professionals: ProfessionalLite[];
  canManage: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onChangeStatus: (s: string) => void;
}) {
  const status = STATUS_LABELS[meeting.status] ?? STATUS_LABELS.upcoming;
  const proMap = new Map(professionals.map((p) => [p.id, p]));
  const attendees = meeting.attendeeIds.map((id) => proMap.get(id)).filter(Boolean) as ProfessionalLite[];

  return (
    <section className="card">
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="font-semibold">{meeting.title}</h3>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ color: status.color, background: status.bg }}
            >
              {status.label}
            </span>
          </div>
          <div className="text-xs text-neutral-500 flex items-center gap-1 mt-1">
            <Calendar size={11} /> {fmtDate(meeting.scheduledAt)}
          </div>
          {meeting.category === "other" && attendees.length > 0 && (
            <div className="text-[11px] text-neutral-500 mt-1">
              Asistentes: {attendees.map((a) => ROLE_LABEL[a.role] ?? a.role).join(", ")} ({attendees.map((a) => a.fullName.split(" ")[0]).join(", ")})
            </div>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {meeting.status === "upcoming" && (
              <button
                onClick={() => onChangeStatus("done")}
                className="text-[11px] px-2 py-1 rounded-lg flex items-center gap-1"
                style={{ background: "#D1FAE5", color: "#065F46" }}
                title="Marcar como hecha"
              >
                <CheckCircle2 size={11} /> Hecha
              </button>
            )}
            <button onClick={onEdit} className="text-neutral-500 hover:text-neutral-900 p-1" title="Editar">
              <Edit2 size={13} />
            </button>
            <button onClick={onRemove} className="text-neutral-400 hover:text-red-600 p-1" title="Borrar">
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Preparación (solo managers) */}
      {canManage && meeting.preparation && (
        <details className="mt-3">
          <summary className="text-xs font-medium cursor-pointer text-amber-800 flex items-center gap-1">
            🛠 Preparación (solo managers)
          </summary>
          <div className="mt-2 text-sm whitespace-pre-wrap p-3 rounded-lg" style={{ background: "#FEF3C7", border: "1px solid #FCD34D" }}>
            {meeting.preparation}
          </div>
        </details>
      )}

      {/* Resumen (todos los con acceso) */}
      {meeting.summary && (
        <details className="mt-3" open>
          <summary className="text-xs font-medium cursor-pointer text-neutral-700">
            📋 Resumen
          </summary>
          <div className="mt-2 text-sm whitespace-pre-wrap p-3 rounded-lg" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
            {meeting.summary}
          </div>
        </details>
      )}
    </section>
  );
}

function MeetingForm({
  category,
  meeting,
  professionals,
  onCancel,
  onSaved,
}: {
  category: MeetingCategory;
  meeting?: Meeting;
  professionals: ProfessionalLite[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [scheduledAt, setScheduledAt] = useState(
    meeting?.scheduledAt ? new Date(meeting.scheduledAt).toISOString().slice(0, 16) : ""
  );
  const [preparation, setPreparation] = useState(meeting?.preparation ?? "");
  const [summary, setSummary] = useState(meeting?.summary ?? "");
  const [attendeeIds, setAttendeeIds] = useState<Set<string>>(new Set(meeting?.attendeeIds ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleAttendee(id: string) {
    setAttendeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setError("");
    if (!title.trim()) return setError("Título obligatorio");
    setSaving(true);
    const body: any = {
      title: title.trim(),
      scheduledAt: scheduledAt || null,
      preparation: preparation.trim() || null,
      summary: summary.trim() || null,
    };
    if (category === "other") body.attendeeIds = Array.from(attendeeIds);
    if (!meeting) body.category = category;
    const res = meeting
      ? await fetch(`/api/team-meetings/${meeting.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch("/api/team-meetings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
    if (res.ok) onSaved();
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "No se pudo guardar");
      setSaving(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Título *</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input text-sm"
          placeholder="Ej. Reunión semanal de equipo"
        />
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Fecha y hora</label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="input text-sm"
        />
      </div>

      {category === "other" && (
        <div>
          <label className="text-xs text-neutral-500 block mb-1.5">Asistentes</label>
          <div className="space-y-0.5 max-h-40 overflow-y-auto rounded-lg p-2" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
            {professionals.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={attendeeIds.has(p.id)}
                  onChange={() => toggleAttendee(p.id)}
                  className="w-3.5 h-3.5"
                />
                <span>{ROLE_LABEL[p.role] ?? p.role} {p.fullName}</span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-neutral-400 mt-1">
            Solo los asistentes seleccionados (más los managers: CEO, Head Success, Setter) verán el resumen.
          </p>
        </div>
      )}

      <div>
        <label className="text-xs text-neutral-500 block mb-1">
          🛠 Preparación <span className="text-amber-700">(visible solo a managers)</span>
        </label>
        <textarea
          value={preparation}
          onChange={(e) => setPreparation(e.target.value)}
          rows={4}
          className="input text-sm font-mono"
          placeholder="Notas internas, agenda, temas a tocar, datos a revisar antes..."
        />
      </div>

      <div>
        <label className="text-xs text-neutral-500 block mb-1">
          📋 Resumen <span className="text-neutral-500">(visible a todos los con acceso)</span>
        </label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={5}
          className="input text-sm font-mono"
          placeholder="Acuerdos, decisiones, próximos pasos. Se publica para que el equipo lo lea."
        />
      </div>

      {error && <div className="text-xs text-red-700">{error}</div>}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-sm text-neutral-500 px-3 py-1.5">Cancelar</button>
        <button
          onClick={save}
          disabled={saving}
          className="text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          {saving ? "Guardando..." : meeting ? "Guardar cambios" : "Crear reunión"}
        </button>
      </div>
    </div>
  );
}
