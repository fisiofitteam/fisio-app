"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { InviteView } from "@/app/fisio/equipo/InviteView";
import { AgendaScheduleView } from "./AgendaScheduleView";

type TeamMember = {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  active: boolean;
  hasPassword: boolean;
  pendingInvite: boolean;
  lastLoginAt: string | null;
  workSchedule: string | null;
};

type Leave = {
  id: string;
  professionalId: string;
  professionalName: string;
  professionalRole: string;
  startDate: string;
  endDate: string;
  status: string;
  daysApplied: number;
  affectedPatientsCount: number;
  notes: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  ceo: "CEO",
  head_success: "Head Success",
  fisio: "Fisio",
  setter: "Setter",
  closer: "Closer",
};

const ROLE_COLOR: Record<string, string> = {
  ceo: "#0A0A0A",
  head_success: "#7C2D12",
  fisio: "#1E40AF",
  setter: "#075985",
  closer: "#5B21B6",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function daysBetweenInclusive(a: string, b: string): number {
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(diff / 86400000) + 1;
}

export function EquipoTabs({
  activeTab,
  isManager,
  currentUserRole,
  currentUserId,
  team,
  leaves,
}: {
  activeTab: string;
  isManager: boolean;
  currentUserRole: string;
  currentUserId: string;
  team: TeamMember[];
  leaves: Leave[];
}) {
  const router = useRouter();
  const [creatingLeave, setCreatingLeave] = useState(false);

  function switchTab(tab: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    router.push(url.pathname + url.search);
  }

  // ¿Tiene acceso al Calendario de llamadas?
  const canSeeClosingShifts = ["ceo", "closer", "setter"].includes(currentUserRole);

  return (
    <>
      <div className="flex gap-1 mb-4 border-b border-neutral-200 overflow-x-auto">
        {/* Miembros solo CEO/Head_success */}
        {isManager && (
          <button
            onClick={() => switchTab("miembros")}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "miembros"
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            👥 Miembros
          </button>
        )}
        <button
          onClick={() => switchTab("calendario")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "calendario"
              ? "border-neutral-900 text-neutral-900"
              : "border-transparent text-neutral-500 hover:text-neutral-900"
          }`}
        >
          🕒 Horario equipo
        </button>
        {canSeeClosingShifts && (
          <button
            onClick={() => switchTab("llamadas")}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "llamadas"
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            🗓️ Calendario de llamadas
          </button>
        )}
      </div>

      {activeTab === "miembros" && isManager && (
        <InviteView team={team} canEditCompensation={currentUserRole === "ceo"} />
      )}

      {activeTab === "llamadas" && canSeeClosingShifts && (
        <AgendaScheduleView team={team.filter((m) => m.active && ["ceo", "closer", "setter"].includes(m.role))} />
      )}

      {activeTab === "calendario" && (
        <>
          <SchedulesBlock team={team.filter((m) => m.active)} currentUserId={currentUserId} />
          <CalendarView
            team={team.filter((m) => m.active)}
            leaves={leaves}
            isManager={isManager}
            currentUserId={currentUserId}
            onCreate={() => setCreatingLeave(true)}
          />
        </>
      )}

      {creatingLeave && (
        <CreateLeaveModal
          team={
            isManager
              ? team.filter((m) => m.active && ["ceo", "head_success", "fisio"].includes(m.role))
              : team.filter((m) => m.id === currentUserId)
          }
          lockToSelf={!isManager}
          onClose={() => setCreatingLeave(false)}
          onSaved={() => {
            setCreatingLeave(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function CalendarView({
  team,
  leaves,
  isManager,
  currentUserId,
  onCreate,
}: {
  team: TeamMember[];
  leaves: Leave[];
  isManager: boolean;
  currentUserId: string;
  onCreate: () => void;
}) {
  // Separar pasadas, activas y futuras
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const active = leaves.filter((l) => new Date(l.startDate) <= today && new Date(l.endDate) >= today);
  const upcoming = leaves.filter((l) => new Date(l.startDate) > today);
  const past = leaves.filter((l) => new Date(l.endDate) < today);

  async function cancelLeave(id: string) {
    if (!confirm("¿Cancelar esta vacación?\n\nSi ya se había aplicado el bonus a los pacientes, se revertirá.")) return;
    const res = await fetch(`/api/professional-leaves?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      window.location.reload();
    } else {
      alert("No se pudo cancelar");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-neutral-500">
          {active.length > 0 && `${active.length} actualmente fuera · `}
          {upcoming.length} próximas
        </p>
        {/* Todos los miembros pueden añadir sus propias vacaciones. Los managers
            pueden además elegir a quién en el formulario. */}
        <button
          onClick={onCreate}
          className="text-xs font-medium px-3 py-2 rounded-lg"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          + Añadir vacaciones
        </button>
      </div>

      {active.length > 0 && (
        <section className="mb-5">
          <h3 className="text-xs uppercase tracking-wider font-medium text-neutral-500 mb-2">
            🌴 Actualmente fuera
          </h3>
          <div className="space-y-2">
            {active.map((l) => {
              const canCancel = isManager || l.professionalId === currentUserId;
              return (
                <LeaveCard
                  key={l.id}
                  leave={l}
                  canCancel={canCancel}
                  onCancel={() => cancelLeave(l.id)}
                  highlighted
                />
              );
            })}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mb-5">
          <h3 className="text-xs uppercase tracking-wider font-medium text-neutral-500 mb-2">
            📅 Próximas vacaciones
          </h3>
          <div className="space-y-2">
            {upcoming.map((l) => {
              const canCancel = isManager || l.professionalId === currentUserId;
              return (
                <LeaveCard
                  key={l.id}
                  leave={l}
                  canCancel={canCancel}
                  onCancel={() => cancelLeave(l.id)}
                />
              );
            })}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider font-medium text-neutral-500 mb-2">
            📖 Histórico
          </h3>
          <div className="space-y-2">
            {past.map((l) => (
              <LeaveCard key={l.id} leave={l} canCancel={false} muted />
            ))}
          </div>
        </section>
      )}

      {leaves.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-neutral-500">
            No hay vacaciones registradas.
            <br />
            <span className="text-xs">Pulsa "+ Añadir vacaciones" para empezar.</span>
          </p>
        </div>
      )}
    </div>
  );
}

function LeaveCard({
  leave,
  canCancel,
  onCancel,
  highlighted,
  muted,
}: {
  leave: Leave;
  canCancel: boolean;
  onCancel?: () => void;
  highlighted?: boolean;
  muted?: boolean;
}) {
  const days = daysBetweenInclusive(leave.startDate, leave.endDate);
  const roleColor = ROLE_COLOR[leave.professionalRole] || "#525252";

  return (
    <div
      className="rounded-lg px-3 py-2.5 text-sm"
      style={{
        background: highlighted ? "#FFFBEB" : muted ? "#FAFAFA" : "#FFFFFF",
        border: highlighted ? "1px solid #FCD34D" : "1px solid #E5E5E5",
        opacity: muted ? 0.7 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium">{leave.professionalName}</span>
            <span
              className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: `${roleColor}1A`, color: roleColor }}
            >
              {ROLE_LABEL[leave.professionalRole] || leave.professionalRole}
            </span>
          </div>
          <div className="text-xs" style={{ color: "#525252" }}>
            {formatDate(leave.startDate)} → {formatDate(leave.endDate)}{" "}
            <span style={{ color: "#737373" }}>
              ({days} {days === 1 ? "día" : "días"})
            </span>
          </div>
          {leave.status === "applied" && leave.daysApplied > 0 && (
            <div className="text-[11px] mt-0.5" style={{ color: "#15803D" }}>
              ✓ Compensados {leave.affectedPatientsCount} {leave.affectedPatientsCount === 1 ? "paciente" : "pacientes"} con +{leave.daysApplied} días
            </div>
          )}
          {leave.status === "applied" && leave.daysApplied === 0 && (
            <div className="text-[11px] mt-0.5" style={{ color: "#737373" }}>
              Sin compensación (vacaciones &lt; 5 días)
            </div>
          )}
          {leave.notes && (
            <div className="text-[11px] mt-0.5 italic" style={{ color: "#737373" }}>
              {leave.notes}
            </div>
          )}
        </div>
        {canCancel && onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-red-600 hover:underline shrink-0"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

function CreateLeaveModal({
  team,
  lockToSelf,
  onClose,
  onSaved,
}: {
  team: TeamMember[];
  /** Si true, el selector de profesional queda fijo al único miembro de `team`. */
  lockToSelf?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [professionalId, setProfessionalId] = useState(team[0]?.id || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const days = startDate && endDate ? daysBetweenInclusive(startDate, endDate) : 0;
  const willCompensate = days >= 5;

  async function save() {
    setError("");
    if (!professionalId || !startDate || !endDate) {
      setError("Faltan datos");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/professional-leaves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        professionalId,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        notes: notes.trim() || null,
      }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo guardar");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">+ Añadir vacaciones</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Si las vacaciones duran 5+ días, los pacientes RECUPERA y CONSOLIDA del fisio recibirán automáticamente días extra en su suscripción y se descontará la parte proporcional del salario en sus métricas.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Profesional</label>
            <select
              className="input text-sm w-full"
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              disabled={lockToSelf}
            >
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} ({ROLE_LABEL[m.role] || m.role})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Desde</label>
              <input
                type="date"
                className="input text-sm w-full"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Hasta</label>
              <input
                type="date"
                className="input text-sm w-full"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Notas (opcional)</label>
            <input
              type="text"
              className="input text-sm w-full"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Vacaciones de verano"
            />
          </div>

          {days > 0 && (
            <div
              className="rounded-lg px-3 py-2 text-xs"
              style={{
                background: willCompensate ? "#ECFDF5" : "#FEF3C7",
                color: willCompensate ? "#065F46" : "#7C2D12",
                border: `1px solid ${willCompensate ? "#10B981" : "#FCD34D"}`,
              }}
            >
              <strong>{days} {days === 1 ? "día" : "días"} fuera.</strong>{" "}
              {willCompensate
                ? `Se sumarán +${days} días al periodo activo de cada paciente RECUPERA/CONSOLIDA asignado y se descontará la parte proporcional del mes en las métricas de salario.`
                : "No habrá compensación a pacientes ni descuento de salario (mínimo 5 días)."}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="w-full text-sm font-medium"
            style={{
              background: "#0A0A0A",
              color: "#FAFAFA",
              padding: 11,
              borderRadius: 10,
              border: "none",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Guardando..." : "Programar vacaciones"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CALENDARIO DE LLAMADAS — gestión de franjas semanales por closer
// ============================================================================

const DAY_LABELS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

type ClosingShift = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  closerId: string;
  closerName: string;
  closerRole: string;
  notes: string | null;
};

function weekStartOfClient(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (dow - 1));
  return d;
}

function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 4); // viernes
  const startStr = weekStart.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const endStr = end.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  return `${startStr} – ${endStr}`;
}

function ClosingShiftsView({ team }: { team: TeamMember[] }) {
  const [weekStart, setWeekStart] = useState<Date>(weekStartOfClient(new Date()));
  const [shifts, setShifts] = useState<ClosingShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<{ dayOfWeek: number } | null>(null);
  const [error, setError] = useState("");

  async function loadShifts() {
    setLoading(true);
    const res = await fetch(`/api/closing-shifts?weekStart=${weekStart.toISOString()}`);
    if (res.ok) {
      const data = await res.json();
      setShifts(data.shifts);
    }
    setLoading(false);
  }

  // Cargar al montar y al cambiar weekStart
  useEffect(() => {
    loadShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.getTime()]);

  function navigateWeek(direction: -1 | 1) {
    const newWeek = new Date(weekStart);
    newWeek.setDate(newWeek.getDate() + 7 * direction);
    setWeekStart(newWeek);
    setError("");
  }

  function goToCurrentWeek() {
    setWeekStart(weekStartOfClient(new Date()));
    setError("");
  }

  async function copyFromPrevious() {
    setError("");
    const res = await fetch("/api/closing-shifts/copy-from-previous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart: weekStart.toISOString() }),
    });
    if (res.ok) {
      loadShifts();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo copiar");
    }
  }

  async function deleteShift(id: string) {
    if (!confirm("¿Eliminar esta franja?")) return;
    const res = await fetch(`/api/closing-shifts?id=${id}`, { method: "DELETE" });
    if (res.ok) loadShifts();
  }

  // Agrupar shifts por día
  const shiftsByDay: Record<number, ClosingShift[]> = {};
  for (let i = 1; i <= 7; i++) shiftsByDay[i] = [];
  for (const s of shifts) shiftsByDay[s.dayOfWeek].push(s);

  const isCurrentWeek = weekStart.getTime() === weekStartOfClient(new Date()).getTime();
  const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay();

  return (
    <div>
      {/* Navegación */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigateWeek(-1)}
            className="text-sm px-2 py-1.5 rounded-md"
            style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}
          >
            ← Anterior
          </button>
          <button
            onClick={goToCurrentWeek}
            className="text-xs px-2 py-1.5 rounded-md"
            style={{
              background: isCurrentWeek ? "#0A0A0A" : "#FFFFFF",
              color: isCurrentWeek ? "#FAFAFA" : "#0A0A0A",
              border: "1px solid " + (isCurrentWeek ? "#0A0A0A" : "#E5E5E5"),
            }}
          >
            Hoy
          </button>
          <button
            onClick={() => navigateWeek(1)}
            className="text-sm px-2 py-1.5 rounded-md"
            style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}
          >
            Siguiente →
          </button>
        </div>
        <div className="text-sm font-medium" style={{ color: "#0A0A0A" }}>
          {formatWeekRange(weekStart)}
        </div>
      </div>

      {/* Botón copiar de la semana anterior si la actual está vacía */}
      {!loading && shifts.length === 0 && (
        <div className="rounded-lg p-3 mb-3" style={{ background: "#FAFAFA", border: "1px dashed #D4D4D4" }}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm" style={{ color: "#525252" }}>
              Esta semana no tiene franjas configuradas.
            </p>
            <button
              onClick={copyFromPrevious}
              className="text-xs font-medium px-3 py-1.5 rounded-md whitespace-nowrap"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              📋 Copiar semana anterior
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg px-3 py-2 mb-3 text-sm" style={{ background: "#FEF2F2", color: "#991B1B", border: "1px solid #F87171" }}>
          {error}
        </div>
      )}

      {/* Días L-V (los principales) */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((dow) => (
          <DayBlock
            key={dow}
            dow={dow}
            label={DAY_LABELS[dow]}
            shifts={shiftsByDay[dow]}
            isToday={isCurrentWeek && dow === todayDow}
            onAdd={() => setAdding({ dayOfWeek: dow })}
            onDelete={deleteShift}
            team={team}
            weekStart={weekStart}
            onChanged={loadShifts}
          />
        ))}
      </div>

      {/* Sábado y Domingo opcionales: solo si tienen franjas (caso edge) */}
      {(shiftsByDay[6].length > 0 || shiftsByDay[7].length > 0) && (
        <div className="space-y-3 mt-3 pt-3" style={{ borderTop: "1px dashed #D4D4D4" }}>
          {[6, 7].filter((d) => shiftsByDay[d].length > 0).map((dow) => (
            <DayBlock
              key={dow}
              dow={dow}
              label={DAY_LABELS[dow]}
              shifts={shiftsByDay[dow]}
              isToday={isCurrentWeek && dow === todayDow}
              onAdd={() => setAdding({ dayOfWeek: dow })}
              onDelete={deleteShift}
              team={team}
              weekStart={weekStart}
              onChanged={loadShifts}
            />
          ))}
        </div>
      )}

      {adding && (
        <AddShiftModal
          weekStart={weekStart}
          dayOfWeek={adding.dayOfWeek}
          team={team}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            loadShifts();
          }}
        />
      )}
    </div>
  );
}

function DayBlock({
  dow,
  label,
  shifts,
  isToday,
  onAdd,
  onDelete,
  team,
  weekStart,
  onChanged,
}: {
  dow: number;
  label: string;
  shifts: ClosingShift[];
  isToday: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
  team: TeamMember[];
  weekStart: Date;
  onChanged: () => void;
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: isToday ? "#FFFBEB" : "#FFFFFF",
        border: isToday ? "1px solid #FCD34D" : "1px solid #E5E5E5",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-sm">{label}</h4>
          {isToday && (
            <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#FCD34D", color: "#78350F" }}>
              HOY
            </span>
          )}
        </div>
        <button
          onClick={onAdd}
          className="text-xs hover:underline"
          style={{ color: "#525252" }}
        >
          + Añadir franja
        </button>
      </div>

      {shifts.length === 0 ? (
        <p className="text-xs italic" style={{ color: "#A3A3A3" }}>
          Sin cobertura
        </p>
      ) : (
        <div className="space-y-1.5">
          {shifts.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm"
              style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium tabular-nums">
                    {s.startTime} – {s.endTime}
                  </span>
                  <span style={{ color: "#737373" }}>→</span>
                  <span className="font-medium">{s.closerName}</span>
                  <span
                    className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
                    style={{ background: "#F5F5F5", color: "#525252" }}
                  >
                    {s.closerRole.toUpperCase()}
                  </span>
                </div>
                {s.notes && (
                  <div className="text-[11px] mt-0.5 italic" style={{ color: "#737373" }}>
                    {s.notes}
                  </div>
                )}
              </div>
              <button
                onClick={() => onDelete(s.id)}
                className="text-xs text-red-600 hover:underline shrink-0"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddShiftModal({
  weekStart,
  dayOfWeek,
  team,
  onClose,
  onSaved,
}: {
  weekStart: Date;
  dayOfWeek: number;
  team: TeamMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("14:00");
  const [closerId, setCloserId] = useState(team[0]?.id || "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (!closerId) {
      setError("Selecciona un closer");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/closing-shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekStart: weekStart.toISOString(),
        dayOfWeek,
        startTime,
        endTime,
        closerId,
        notes: notes.trim() || null,
      }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo guardar");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">+ Añadir franja</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          {DAY_LABELS[dayOfWeek]} · semana del{" "}
          {weekStart.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Desde</label>
              <input
                type="time"
                className="input text-sm w-full"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Hasta</label>
              <input
                type="time"
                className="input text-sm w-full"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Closer asignado</label>
            <select
              className="input text-sm w-full"
              value={closerId}
              onChange={(e) => setCloserId(e.target.value)}
            >
              {team.length === 0 && <option value="">— No hay closers disponibles —</option>}
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} ({m.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Notas (opcional)</label>
            <input
              type="text"
              className="input text-sm w-full"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. solo videollamadas"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={save}
            disabled={saving || team.length === 0}
            className="w-full text-sm font-medium"
            style={{
              background: "#0A0A0A",
              color: "#FAFAFA",
              padding: 11,
              borderRadius: 10,
              border: "none",
              opacity: saving || team.length === 0 ? 0.5 : 1,
            }}
          >
            {saving ? "Guardando..." : "Crear franja"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bloque "Horario equipo": muestra el horario de cada miembro (texto libre).
// Cada uno puede editar el suyo inline; el resto en solo lectura.
function SchedulesBlock({ team, currentUserId }: { team: TeamMember[]; currentUserId: string }) {
  return (
    <section className="card mb-4">
      <div className="mb-3">
        <h2 className="font-medium text-sm">🕒 Horario del equipo</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Cada uno edita el suyo. Lo verá todo el equipo.
        </p>
      </div>
      <div className="divide-y divide-neutral-100">
        {team.length === 0 && (
          <p className="text-xs text-neutral-400 italic py-4 text-center">Sin miembros activos.</p>
        )}
        {team.map((m) => (
          <ScheduleRow key={m.id} member={m} isMe={m.id === currentUserId} />
        ))}
      </div>
    </section>
  );
}

function ScheduleRow({ member, isMe }: { member: TeamMember; isMe: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(member.workSchedule ?? "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save() {
    setSaving(true);
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workSchedule: value }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="py-3 flex items-start justify-between gap-3 flex-wrap">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">
          {member.fullName}
          {isMe && <span className="text-[10px] text-neutral-400 ml-1">(tú)</span>}
        </div>
        <div className="text-[11px] text-neutral-400 capitalize">{ROLE_LABEL_SCHED[member.role] ?? member.role}</div>
      </div>
      <div className="flex-1 min-w-[280px]">
        {editing && isMe ? (
          <div className="flex items-start gap-2">
            <textarea
              className="input text-sm flex-1"
              rows={2}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ej: L-V · 9:00-14:00 y 16:00-19:00"
              autoFocus
            />
            <div className="flex flex-col gap-1">
              <button onClick={save} disabled={saving} className="btn btn-primary text-xs">
                {saving ? "..." : "Guardar"}
              </button>
              <button onClick={() => { setValue(member.workSchedule ?? ""); setEditing(false); }} className="text-xs text-neutral-500">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="text-sm text-neutral-700 whitespace-pre-line flex-1">
              {member.workSchedule || <span className="italic text-neutral-400">Sin horario configurado</span>}
            </div>
            {isMe && (
              <button onClick={() => setEditing(true)} className="text-xs text-neutral-500 hover:text-neutral-900 flex-shrink-0">
                ✏️ Editar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const ROLE_LABEL_SCHED: Record<string, string> = {
  ceo: "CEO",
  head_success: "Head-success",
  fisio: "Fisio",
  closer: "Closer",
  setter: "Setter",
};

