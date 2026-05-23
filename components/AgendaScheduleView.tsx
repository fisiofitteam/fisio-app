"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, X, Pencil, Calendar, CalendarOff, Settings2 } from "lucide-react";

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
  fromDefault?: boolean;
};

type BlockRecord = {
  id: string;
  blockedDate: string;        // YYYY-MM-DD
  blockedStartTime: string | null;
  blockedEndTime: string | null;
  reason: string | null;
};

// ============================================================================
// HELPERS
// ============================================================================
const DAY_LABELS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DAYS = [1, 2, 3, 4, 5, 6, 7];

function weekStartOfClient(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (dow - 1));
  return d;
}

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const startStr = weekStart.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const endStr = end.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  return `${startStr} – ${endStr}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
type SubTab = "template" | "week" | "blocks";

export function AgendaScheduleView({ team }: { team: TeamMember[] }) {
  const [subTab, setSubTab] = useState<SubTab>("template");

  return (
    <div className="space-y-4">
      {/* Tabs secundarias */}
      <div className="flex gap-1 p-1 rounded-xl bg-neutral-100 inline-flex">
        <SubTabButton active={subTab === "template"} onClick={() => setSubTab("template")} icon={<Settings2 size={14} />}>
          Plantilla por defecto
        </SubTabButton>
        <SubTabButton active={subTab === "week"} onClick={() => setSubTab("week")} icon={<Calendar size={14} />}>
          Por semana
        </SubTabButton>
        <SubTabButton active={subTab === "blocks"} onClick={() => setSubTab("blocks")} icon={<CalendarOff size={14} />}>
          Bloqueos
        </SubTabButton>
      </div>

      {subTab === "template" && <TemplateView team={team} />}
      {subTab === "week" && <WeekView team={team} />}
      {subTab === "blocks" && <BlocksView />}
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
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingDay, setAddingDay] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/agenda-template");
    if (res.ok) {
      const data = await res.json();
      setShifts(data.shifts || []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const byDay: Record<number, ShiftRecord[]> = {};
  for (let i = 1; i <= 7; i++) byDay[i] = [];
  for (const s of shifts) byDay[s.dayOfWeek].push(s);

  return (
    <div className="space-y-3">
      <div className="rounded-lg p-3 text-sm" style={{ background: "#EFF6FF", border: "1px solid #DBEAFE", color: "#1E40AF" }}>
        <strong>Plantilla por defecto.</strong> Este horario se aplica a TODAS las semanas. Cualquier cambio aquí afecta a todas las semanas futuras.
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : (
        <div className="space-y-2">
          {DAYS.map((dow) => (
            <DayBlock
              key={dow}
              dayOfWeek={dow}
              shifts={byDay[dow]}
              team={team}
              editingId={editingId}
              setEditingId={setEditingId}
              addingDay={addingDay}
              setAddingDay={setAddingDay}
              endpoint="/api/agenda-template"
              onChange={load}
              showFromDefaultBadge={false}
            />
          ))}
        </div>
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
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingDay, setAddingDay] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/week-shifts?week=${isoDate(weekStart)}`);
    if (res.ok) {
      const data = await res.json();
      setShifts(data.shifts || []);
      setUsingDefault(data.usingDefault);
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

  const byDay: Record<number, ShiftRecord[]> = {};
  for (let i = 1; i <= 7; i++) byDay[i] = [];
  for (const s of shifts) byDay[s.dayOfWeek].push(s);

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
            <p className="text-xs mt-0.5">Si necesitas cambios solo para esta semana, pulsa el botón.</p>
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
            <p className="text-xs mt-0.5">Los cambios solo afectan a esta semana. Puedes restaurar la plantilla.</p>
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

      {/* Días */}
      {loading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : (
        <div className="space-y-2">
          {DAYS.map((dow) => (
            <DayBlock
              key={dow}
              dayOfWeek={dow}
              shifts={byDay[dow]}
              team={team}
              editingId={editingId}
              setEditingId={setEditingId}
              addingDay={addingDay}
              setAddingDay={setAddingDay}
              // Si estamos en plantilla: editar = plantilla. Si personalizado: editar shifts de la semana.
              endpoint={usingDefault ? "/api/agenda-template" : "/api/closing-shifts"}
              extraCreateBody={usingDefault ? {} : { weekStart: weekStart.toISOString() }}
              onChange={load}
              showFromDefaultBadge={usingDefault}
              readOnly={usingDefault}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPONENTE: BLOQUE DE UN DÍA CON SUS FRANJAS
// ============================================================================
function DayBlock({
  dayOfWeek,
  shifts,
  team,
  editingId,
  setEditingId,
  addingDay,
  setAddingDay,
  endpoint,
  extraCreateBody = {},
  onChange,
  showFromDefaultBadge,
  readOnly = false,
}: {
  dayOfWeek: number;
  shifts: ShiftRecord[];
  team: TeamMember[];
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  addingDay: number | null;
  setAddingDay: (d: number | null) => void;
  endpoint: string;
  extraCreateBody?: Record<string, unknown>;
  onChange: () => void;
  showFromDefaultBadge: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-50 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{DAY_LABELS[dayOfWeek]}</span>
          {shifts.length === 0 && !readOnly && (
            <span className="text-[10px] text-neutral-400">sin franjas</span>
          )}
        </div>
        {!readOnly && (
          <button
            onClick={() => setAddingDay(dayOfWeek)}
            className="text-xs font-medium px-2 py-1 rounded-md flex items-center gap-1"
            style={{ background: "#FAFAFA", border: "1px solid #E5E5E5", color: "#171717" }}
          >
            <Plus size={12} /> Añadir
          </button>
        )}
      </div>

      <div className="divide-y divide-neutral-100">
        {shifts.length === 0 && readOnly && (
          <div className="px-3 py-2 text-xs text-neutral-400 italic">Sin franjas en este día</div>
        )}
        {shifts.map((s) => (
          <ShiftRow
            key={s.id}
            shift={s}
            team={team}
            isEditing={editingId === s.id}
            onEdit={() => !readOnly && setEditingId(s.id)}
            onCancel={() => setEditingId(null)}
            endpoint={endpoint}
            onChange={() => { setEditingId(null); onChange(); }}
            showFromDefaultBadge={showFromDefaultBadge}
            readOnly={readOnly}
          />
        ))}

        {addingDay === dayOfWeek && !readOnly && (
          <AddShiftForm
            dayOfWeek={dayOfWeek}
            team={team}
            endpoint={endpoint}
            extraBody={extraCreateBody}
            onCancel={() => setAddingDay(null)}
            onCreated={() => { setAddingDay(null); onChange(); }}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// FILA DE UNA FRANJA (vista + edición inline)
// ============================================================================
function ShiftRow({
  shift,
  team,
  isEditing,
  onEdit,
  onCancel,
  endpoint,
  onChange,
  showFromDefaultBadge,
  readOnly,
}: {
  shift: ShiftRecord;
  team: TeamMember[];
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  endpoint: string;
  onChange: () => void;
  showFromDefaultBadge: boolean;
  readOnly: boolean;
}) {
  const [startTime, setStartTime] = useState(shift.startTime);
  const [endTime, setEndTime] = useState(shift.endTime);
  const [closerId, setCloserId] = useState(shift.closerId);
  const [saving, setSaving] = useState(false);

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
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <div className="text-sm tabular-nums flex items-center gap-2 flex-wrap">
          <span className="font-medium">{shift.startTime} → {shift.endTime}</span>
          <span className="text-neutral-400">·</span>
          <span className="text-neutral-700">👤 {shift.closer.fullName}</span>
          {showFromDefaultBadge && (
            <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#DBEAFE", color: "#1E40AF" }}>
              PLANTILLA
            </span>
          )}
        </div>
        {!readOnly && (
          <div className="flex gap-1">
            <button onClick={onEdit} className="p-1.5 rounded-md hover:bg-neutral-100" title="Editar">
              <Pencil size={14} className="text-neutral-500" />
            </button>
            <button onClick={deleteShift} className="p-1.5 rounded-md hover:bg-red-50" title="Eliminar">
              <Trash2 size={14} className="text-red-500" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-3 py-3 bg-blue-50 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-neutral-500 block mb-0.5">Inicio</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-300 tabular-nums"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-neutral-500 block mb-0.5">Fin</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-300 tabular-nums"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-neutral-500 block mb-0.5">Closer</label>
          <select
            value={closerId}
            onChange={(e) => setCloserId(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-300 bg-white"
          >
            {team.map((m) => (
              <option key={m.id} value={m.id}>{m.fullName} ({m.role})</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-md border border-neutral-300 bg-white">Cancelar</button>
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 text-xs font-medium rounded-md"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// FORM CREAR FRANJA
// ============================================================================
function AddShiftForm({
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
      setErr(data.error || "No se pudo crear");
      setSaving(false);
    }
  }

  return (
    <div className="px-3 py-3 bg-blue-50 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-neutral-500 block mb-0.5">Inicio</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-300 tabular-nums"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-neutral-500 block mb-0.5">Fin</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-300 tabular-nums"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-neutral-500 block mb-0.5">Closer</label>
          <select
            value={closerId}
            onChange={(e) => setCloserId(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-300 bg-white"
          >
            {team.map((m) => (
              <option key={m.id} value={m.id}>{m.fullName} ({m.role})</option>
            ))}
          </select>
        </div>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-md border border-neutral-300 bg-white">Cancelar</button>
        <button
          onClick={create}
          disabled={saving || !closerId}
          className="px-3 py-1.5 text-xs font-medium rounded-md"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          {saving ? "Creando..." : "Crear franja"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// VISTA: BLOQUEOS
// ============================================================================
function BlocksView() {
  const [blocks, setBlocks] = useState<BlockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/agenda-blocks");
    if (res.ok) {
      const data = await res.json();
      setBlocks(data.blocks || []);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function deleteBlock(id: string) {
    if (!confirm("¿Eliminar este bloqueo?")) return;
    const res = await fetch(`/api/agenda-blocks/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg p-3 text-sm" style={{ background: "#FEF3C7", border: "1px solid #FDE68A", color: "#92400E" }}>
        <strong>Bloqueos puntuales.</strong> Usa esto para indisposiciones, vacaciones o festivos. Puedes bloquear un día entero o solo franjas concretas.
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setAdding(true)}
          className="text-sm font-medium px-3 py-1.5 rounded-md flex items-center gap-1"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          <Plus size={14} /> Nuevo bloqueo
        </button>
      </div>

      {adding && <AddBlockForm onCancel={() => setAdding(false)} onCreated={() => { setAdding(false); load(); }} />}

      {loading ? (
        <p className="text-sm text-neutral-500">Cargando…</p>
      ) : blocks.length === 0 ? (
        <div className="rounded-lg p-6 text-center text-sm text-neutral-500" style={{ background: "#FAFAFA", border: "1px dashed #E5E5E5" }}>
          No hay bloqueos próximos.
        </div>
      ) : (
        <div className="space-y-2">
          {blocks.map((b) => {
            const d = new Date(b.blockedDate + "T12:00:00Z");
            const dayLabel = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
            const fullDay = !b.blockedStartTime || !b.blockedEndTime;
            return (
              <div key={b.id} className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium capitalize">{dayLabel}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {fullDay ? "Día completo bloqueado" : `Franja ${b.blockedStartTime} – ${b.blockedEndTime}`}
                    {b.reason && <span className="ml-2">· {b.reason}</span>}
                  </div>
                </div>
                <button onClick={() => deleteBlock(b.id)} className="p-1.5 rounded-md hover:bg-red-50">
                  <Trash2 size={14} className="text-red-500" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddBlockForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [blockedDate, setBlockedDate] = useState(isoDate(new Date()));
  const [fullDay, setFullDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    const body: any = { blockedDate };
    if (!fullDay) { body.blockedStartTime = startTime; body.blockedEndTime = endTime; }
    if (reason.trim()) body.reason = reason.trim();
    const res = await fetch("/api/agenda-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) onCreated();
    else setSaving(false);
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-blue-50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Nuevo bloqueo</h4>
        <button onClick={onCancel} className="p-1 hover:bg-white rounded">
          <X size={14} className="text-neutral-500" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-neutral-500 block mb-0.5">Fecha</label>
          <input
            type="date"
            value={blockedDate}
            onChange={(e) => setBlockedDate(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-300 bg-white"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-neutral-500 block mb-0.5">Motivo (opcional)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. Vacaciones, festivo..."
            className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-300 bg-white"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={fullDay}
          onChange={(e) => setFullDay(e.target.checked)}
        />
        Bloquear día completo
      </label>

      {!fullDay && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-neutral-500 block mb-0.5">Inicio</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-300 tabular-nums" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-neutral-500 block mb-0.5">Fin</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-300 tabular-nums" />
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-md border border-neutral-300 bg-white">Cancelar</button>
        <button
          onClick={create}
          disabled={saving}
          className="px-3 py-1.5 text-xs font-medium rounded-md"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          {saving ? "Creando..." : "Crear bloqueo"}
        </button>
      </div>
    </div>
  );
}
