"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, X, Settings2, Calendar } from "lucide-react";

// ============================================================================
// COLORES POR CLOSER (HARDCODED)
// ============================================================================
// Si añades nuevos closers principales, edita este mapeo.
// El matching es por nombre (case-insensitive, primera palabra).
function colorForCloser(name: string): { bg: string; border: string; text: string; dot: string } {
  const firstName = (name || "").trim().split(" ")[0].toLowerCase();
  if (firstName === "alba") {
    return { bg: "#F3E8FF", border: "#C084FC", text: "#6B21A8", dot: "#A855F7" };
  }
  if (firstName === "ales") {
    return { bg: "#DBEAFE", border: "#60A5FA", text: "#1E3A8A", dot: "#3B82F6" };
  }
  // Otros: gris neutro
  return { bg: "#F5F5F5", border: "#D4D4D4", text: "#404040", dot: "#737373" };
}

// ============================================================================
// TIPOS
// ============================================================================
type TeamMember = {
  id: string;
  fullName: string;
  role: string;
  active: boolean;
};

type ShiftRecord = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  closerId: string;
  closer: { id: string; fullName: string; role: string };
  slotDurationMinutes: number;
};

const DAYS = [1, 2, 3, 4, 5];                                       // Solo L-V
const DAY_LABELS = ["", "Lun", "Mar", "Mié", "Jue", "Vie"];
const DAY_LABELS_LONG = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const DURATION_OPTIONS = [30, 45, 60];

// ============================================================================
// HELPERS
// ============================================================================
function weekStartOfClient(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (dow - 1));
  return d;
}

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 4);                                   // viernes
  const startStr = weekStart.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const endStr = end.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  return `${startStr} – ${endStr}`;
}

function isoDate(d: Date): string {
  // IMPORTANTE: NO usar d.toISOString().slice(0, 10) porque eso devuelve la
  // fecha en UTC, lo que descoloca el día cuando d está en hora local con
  // offset positivo (ej. Madrid CEST +2): un lunes 00:00 local = domingo 22:00 UTC,
  // y toISOString.slice(0,10) devolvería domingo en vez de lunes.
  // Usamos los componentes locales del Date para construir el YYYY-MM-DD.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ============================================================================
// COMPONENTE PRINCIPAL: 2 sub-tabs (Plantilla / Por semana)
// ============================================================================
type SubTab = "template" | "week";

export function AgendaScheduleView({ team }: { team: TeamMember[] }) {
  const [subTab, setSubTab] = useState<SubTab>("template");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-xl bg-neutral-100 inline-flex">
        <SubTabButton active={subTab === "template"} onClick={() => setSubTab("template")} icon={<Settings2 size={14} />}>
          Plantilla por defecto
        </SubTabButton>
        <SubTabButton active={subTab === "week"} onClick={() => setSubTab("week")} icon={<Calendar size={14} />}>
          Por semana
        </SubTabButton>
      </div>

      {subTab === "template" && <TemplateView team={team} />}
      {subTab === "week" && <WeekView team={team} />}
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
      style={{
        background: active ? "#FFFFFF" : "transparent",
        color: active ? "#0A0A0A" : "#525252",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
      }}
    >
      {icon}
      {children}
    </button>
  );
}

// ============================================================================
// VISTA: PLANTILLA POR DEFECTO
// ============================================================================
function TemplateView({ team }: { team: TeamMember[] }) {
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/agenda-template");
    if (res.ok) {
      const data = await res.json();
      setShifts(data.shifts || []);
      setDuration(data.slotDurationMinutes || 60);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function changeDuration(newDur: number) {
    const res = await fetch("/api/agenda-template/duration", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotDurationMinutes: newDur }),
    });
    if (res.ok) load();
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg p-3 text-sm" style={{ background: "#EFF6FF", border: "1px solid #DBEAFE", color: "#1E40AF" }}>
        <strong>Plantilla por defecto.</strong> Este horario se aplica a TODAS las semanas que no estén personalizadas.
      </div>

      <DurationSelector value={duration} onChange={changeDuration} />

      {loading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : (
        <WeekGrid
          shifts={shifts}
          team={team}
          endpoint="/api/agenda-template"
          extraCreateBody={{ slotDurationMinutes: duration }}
          onChange={load}
          readOnly={false}
        />
      )}
    </div>
  );
}

// ============================================================================
// VISTA: SEMANA CONCRETA
// ============================================================================
function WeekView({ team }: { team: TeamMember[] }) {
  const [weekStart, setWeekStart] = useState<Date>(weekStartOfClient(new Date()));
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [usingDefault, setUsingDefault] = useState(true);
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/week-shifts?week=${isoDate(weekStart)}`);
    if (res.ok) {
      const data = await res.json();
      setShifts(data.shifts || []);
      setUsingDefault(data.usingDefault);
      setDuration(data.slotDurationMinutes || 60);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [weekStart.getTime()]);

  async function personalizeWeek() {
    const res = await fetch("/api/week-shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week: isoDate(weekStart) }),
    });
    if (res.ok) load();
  }

  async function restoreTemplate() {
    if (!confirm("¿Eliminar los cambios de esta semana y volver a usar la plantilla?")) return;
    const res = await fetch(`/api/week-shifts?week=${isoDate(weekStart)}`, { method: "DELETE" });
    if (res.ok) load();
  }

  async function changeDuration(newDur: number) {
    const res = await fetch("/api/week-shifts/duration", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week: isoDate(weekStart), slotDurationMinutes: newDur }),
    });
    if (res.ok) load();
  }

  const isCurrentWeek = weekStart.getTime() === weekStartOfClient(new Date()).getTime();

  return (
    <div className="space-y-3">
      {/* Selector de semana */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}
          className="px-2 py-1.5 rounded-md text-xs border border-neutral-200 bg-white hover:bg-neutral-50"
        >
          ← Anterior
        </button>
        <div className="text-sm font-medium px-2">{formatWeekRange(weekStart)}</div>
        <button
          onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}
          className="px-2 py-1.5 rounded-md text-xs border border-neutral-200 bg-white hover:bg-neutral-50"
        >
          Siguiente →
        </button>
        {!isCurrentWeek && (
          <button
            onClick={() => setWeekStart(weekStartOfClient(new Date()))}
            className="px-2 py-1.5 rounded-md text-xs font-medium"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            Esta semana
          </button>
        )}
      </div>

      {/* Estado de la semana */}
      {usingDefault ? (
        <div
          className="rounded-lg p-3 flex items-start justify-between gap-3"
          style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534" }}
        >
          <div className="text-sm">
            <strong>Esta semana usa la plantilla por defecto.</strong>
            <p className="text-xs mt-0.5">Si necesitas cambios solo para esta semana, púlsalo abajo.</p>
          </div>
          <button
            onClick={personalizeWeek}
            className="text-xs font-medium px-3 py-1.5 rounded-md whitespace-nowrap"
            style={{ background: "#15803D", color: "#FFFFFF" }}
          >
            Personalizar esta semana
          </button>
        </div>
      ) : (
        <div
          className="rounded-lg p-3 flex items-start justify-between gap-3"
          style={{ background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E" }}
        >
          <div className="text-sm">
            <strong>Semana personalizada.</strong>
            <p className="text-xs mt-0.5">Los cambios solo afectan a esta semana.</p>
          </div>
          <button
            onClick={restoreTemplate}
            className="text-xs font-medium px-3 py-1.5 rounded-md whitespace-nowrap"
            style={{ background: "#FFFFFF", color: "#92400E", border: "1px solid #FDE68A" }}
          >
            Restaurar plantilla
          </button>
        </div>
      )}

      {/* Selector duración: solo editable si la semana está personalizada */}
      <DurationSelector value={duration} onChange={changeDuration} disabled={usingDefault} />

      {/* Grid */}
      {loading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : (
        <WeekGrid
          shifts={shifts}
          team={team}
          endpoint={usingDefault ? "/api/agenda-template" : "/api/closing-shifts"}
          extraCreateBody={
            usingDefault
              ? { slotDurationMinutes: duration }
              : { weekStart: weekStart.toISOString(), slotDurationMinutes: duration }
          }
          onChange={load}
          readOnly={usingDefault}
        />
      )}
    </div>
  );
}

// ============================================================================
// SELECTOR DE DURACIÓN
// ============================================================================
function DurationSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs uppercase tracking-wider font-semibold text-neutral-500">
        Duración de llamadas:
      </span>
      <div className="flex gap-1 p-0.5 rounded-md bg-neutral-100">
        {DURATION_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => !disabled && opt !== value && onChange(opt)}
            disabled={disabled}
            className="px-3 py-1 text-xs font-medium rounded-md tabular-nums"
            style={{
              background: opt === value ? "#FFFFFF" : "transparent",
              color: opt === value ? "#0A0A0A" : disabled ? "#A3A3A3" : "#525252",
              boxShadow: opt === value ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {opt} min
          </button>
        ))}
      </div>
      {disabled && (
        <span className="text-[11px] text-neutral-500">
          (personaliza la semana para editar)
        </span>
      )}
    </div>
  );
}

// ============================================================================
// GRID SEMANAL HORIZONTAL (Lun-Vie en columnas)
// ============================================================================
function WeekGrid({
  shifts,
  team,
  endpoint,
  extraCreateBody = {},
  onChange,
  readOnly,
}: {
  shifts: ShiftRecord[];
  team: TeamMember[];
  endpoint: string;
  extraCreateBody?: Record<string, unknown>;
  onChange: () => void;
  readOnly: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingDay, setAddingDay] = useState<number | null>(null);

  // Agrupar shifts por día
  const byDay: Record<number, ShiftRecord[]> = {};
  for (let i = 1; i <= 5; i++) byDay[i] = [];
  for (const s of shifts) {
    if (s.dayOfWeek >= 1 && s.dayOfWeek <= 5) byDay[s.dayOfWeek].push(s);
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
      {DAYS.map((dow) => (
        <DayColumn
          key={dow}
          dayOfWeek={dow}
          shifts={byDay[dow]}
          team={team}
          editingId={editingId}
          setEditingId={setEditingId}
          isAdding={addingDay === dow}
          startAdd={() => setAddingDay(dow)}
          cancelAdd={() => setAddingDay(null)}
          endpoint={endpoint}
          extraCreateBody={extraCreateBody}
          onChange={() => { setEditingId(null); setAddingDay(null); onChange(); }}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

// ============================================================================
// COLUMNA DE UN DÍA
// ============================================================================
function DayColumn({
  dayOfWeek,
  shifts,
  team,
  editingId,
  setEditingId,
  isAdding,
  startAdd,
  cancelAdd,
  endpoint,
  extraCreateBody,
  onChange,
  readOnly,
}: {
  dayOfWeek: number;
  shifts: ShiftRecord[];
  team: TeamMember[];
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  isAdding: boolean;
  startAdd: () => void;
  cancelAdd: () => void;
  endpoint: string;
  extraCreateBody: Record<string, unknown>;
  onChange: () => void;
  readOnly: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden flex flex-col">
      <div className="px-2 py-1.5 bg-neutral-50 border-b border-neutral-200 text-center">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500">
          {DAY_LABELS[dayOfWeek]}
        </div>
        <div className="text-xs font-semibold">{DAY_LABELS_LONG[dayOfWeek]}</div>
      </div>

      <div className="p-1.5 space-y-1.5 flex-1">
        {shifts.length === 0 && !isAdding && (
          <div className="text-[10px] text-neutral-400 italic text-center py-2">
            sin franjas
          </div>
        )}
        {shifts.map((s) => (
          <ShiftCard
            key={s.id}
            shift={s}
            team={team}
            isEditing={editingId === s.id}
            onEdit={() => !readOnly && setEditingId(s.id)}
            onCancel={() => setEditingId(null)}
            endpoint={endpoint}
            onChange={onChange}
            readOnly={readOnly}
          />
        ))}
        {isAdding && !readOnly && (
          <AddShiftCard
            dayOfWeek={dayOfWeek}
            team={team}
            endpoint={endpoint}
            extraBody={extraCreateBody}
            onCancel={cancelAdd}
            onCreated={onChange}
          />
        )}
      </div>

      {!readOnly && !isAdding && (
        <button
          onClick={startAdd}
          className="mx-1.5 mb-1.5 px-2 py-1 text-[11px] font-medium rounded-md flex items-center justify-center gap-1 hover:bg-neutral-50"
          style={{ border: "1px dashed #D4D4D4", color: "#737373" }}
        >
          <Plus size={11} /> Añadir
        </button>
      )}
    </div>
  );
}

// ============================================================================
// CARD DE UNA FRANJA (vista + edición)
// ============================================================================
function ShiftCard({
  shift,
  team,
  isEditing,
  onEdit,
  onCancel,
  endpoint,
  onChange,
  readOnly,
}: {
  shift: ShiftRecord;
  team: TeamMember[];
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  endpoint: string;
  onChange: () => void;
  readOnly: boolean;
}) {
  const [startTime, setStartTime] = useState(shift.startTime);
  const [endTime, setEndTime] = useState(shift.endTime);
  const [closerId, setCloserId] = useState(shift.closerId);
  const [saving, setSaving] = useState(false);
  const colors = colorForCloser(shift.closer.fullName);

  async function save() {
    setSaving(true);
    const res = await fetch(`${endpoint}/${shift.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startTime, endTime, closerId }),
    });
    if (res.ok) onChange();
    setSaving(false);
  }

  async function deleteShift() {
    if (!confirm("¿Eliminar esta franja?")) return;
    const res = await fetch(`${endpoint}/${shift.id}`, { method: "DELETE" });
    if (res.ok) onChange();
  }

  if (!isEditing) {
    return (
      <div
        onClick={() => !readOnly && onEdit()}
        className="rounded-md px-2 py-1.5 text-xs"
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          color: colors.text,
          cursor: readOnly ? "default" : "pointer",
        }}
      >
        <div className="font-semibold tabular-nums">
          {shift.startTime} → {shift.endTime}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: colors.dot }}
          />
          <span className="truncate">{shift.closer.fullName}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-md p-2 space-y-1.5"
      style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}
    >
      <div className="flex gap-1">
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="flex-1 min-w-0 px-1 py-1 text-xs rounded border border-neutral-300 tabular-nums"
        />
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="flex-1 min-w-0 px-1 py-1 text-xs rounded border border-neutral-300 tabular-nums"
        />
      </div>
      <select
        value={closerId}
        onChange={(e) => setCloserId(e.target.value)}
        className="w-full px-1 py-1 text-xs rounded border border-neutral-300 bg-white"
      >
        {team.map((m) => (
          <option key={m.id} value={m.id}>{m.fullName}</option>
        ))}
      </select>
      <div className="flex gap-1">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 px-1.5 py-1 text-[10px] font-medium rounded-md"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          {saving ? "..." : "Guardar"}
        </button>
        <button
          onClick={onCancel}
          className="px-1.5 py-1 text-[10px] rounded-md border border-neutral-300 bg-white"
        >
          Cancelar
        </button>
        <button
          onClick={deleteShift}
          className="px-1.5 py-1 rounded-md hover:bg-red-50"
          title="Eliminar"
        >
          <Trash2 size={11} className="text-red-500" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// CREAR NUEVA FRANJA
// ============================================================================
function AddShiftCard({
  dayOfWeek,
  team,
  endpoint,
  extraBody,
  onCancel,
  onCreated,
}: {
  dayOfWeek: number;
  team: TeamMember[];
  endpoint: string;
  extraBody: Record<string, unknown>;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [closerId, setCloserId] = useState(team[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    setSaving(true);
    setErr("");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayOfWeek, startTime, endTime, closerId, ...extraBody }),
    });
    if (res.ok) onCreated();
    else {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "Error");
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-md p-2 space-y-1.5"
      style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}
    >
      <div className="flex gap-1">
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="flex-1 min-w-0 px-1 py-1 text-xs rounded border border-neutral-300 tabular-nums"
        />
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="flex-1 min-w-0 px-1 py-1 text-xs rounded border border-neutral-300 tabular-nums"
        />
      </div>
      <select
        value={closerId}
        onChange={(e) => setCloserId(e.target.value)}
        className="w-full px-1 py-1 text-xs rounded border border-neutral-300 bg-white"
      >
        {team.map((m) => (
          <option key={m.id} value={m.id}>{m.fullName}</option>
        ))}
      </select>
      {err && <p className="text-[10px] text-red-600">{err}</p>}
      <div className="flex gap-1">
        <button
          onClick={create}
          disabled={saving || !closerId}
          className="flex-1 px-1.5 py-1 text-[10px] font-medium rounded-md"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          {saving ? "..." : "Crear"}
        </button>
        <button
          onClick={onCancel}
          className="px-1.5 py-1 rounded-md hover:bg-neutral-100"
        >
          <X size={11} className="text-neutral-500" />
        </button>
      </div>
    </div>
  );
}
