"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { InviteView } from "@/app/fisio/equipo/InviteView";

type TeamMember = {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  active: boolean;
  hasPassword: boolean;
  pendingInvite: boolean;
  lastLoginAt: string | null;
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
  team,
  leaves,
}: {
  activeTab: string;
  isManager: boolean;
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

  return (
    <>
      <div className="flex gap-1 mb-4 border-b border-neutral-200">
        {/* Miembros solo CEO */}
        {team.find((m) => m.role === "ceo") && (
          <button
            onClick={() => switchTab("miembros")}
            disabled={!isManager}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "miembros"
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-900"
            } ${!isManager ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            👥 Miembros
          </button>
        )}
        <button
          onClick={() => switchTab("calendario")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "calendario"
              ? "border-neutral-900 text-neutral-900"
              : "border-transparent text-neutral-500 hover:text-neutral-900"
          }`}
        >
          📅 Calendario equipo
        </button>
      </div>

      {activeTab === "miembros" && isManager && (
        <InviteView team={team} />
      )}

      {activeTab === "calendario" && (
        <CalendarView
          team={team.filter((m) => m.active)}
          leaves={leaves}
          isManager={isManager}
          onCreate={() => setCreatingLeave(true)}
        />
      )}

      {creatingLeave && (
        <CreateLeaveModal
          team={team.filter((m) => m.active && ["ceo", "head_success", "fisio"].includes(m.role))}
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
  onCreate,
}: {
  team: TeamMember[];
  leaves: Leave[];
  isManager: boolean;
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
        {isManager && (
          <button
            onClick={onCreate}
            className="text-xs font-medium px-3 py-2 rounded-lg"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            + Añadir vacaciones
          </button>
        )}
      </div>

      {active.length > 0 && (
        <section className="mb-5">
          <h3 className="text-xs uppercase tracking-wider font-medium text-neutral-500 mb-2">
            🌴 Actualmente fuera
          </h3>
          <div className="space-y-2">
            {active.map((l) => (
              <LeaveCard key={l.id} leave={l} isManager={isManager} onCancel={() => cancelLeave(l.id)} highlighted />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mb-5">
          <h3 className="text-xs uppercase tracking-wider font-medium text-neutral-500 mb-2">
            📅 Próximas vacaciones
          </h3>
          <div className="space-y-2">
            {upcoming.map((l) => (
              <LeaveCard key={l.id} leave={l} isManager={isManager} onCancel={() => cancelLeave(l.id)} />
            ))}
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
              <LeaveCard key={l.id} leave={l} isManager={false} muted />
            ))}
          </div>
        </section>
      )}

      {leaves.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-neutral-500">
            No hay vacaciones registradas.
            {isManager && (
              <>
                <br />
                <span className="text-xs">Pulsa "+ Añadir vacaciones" para empezar.</span>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function LeaveCard({
  leave,
  isManager,
  onCancel,
  highlighted,
  muted,
}: {
  leave: Leave;
  isManager: boolean;
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
              Sin compensación (vacaciones &lt; 8 días)
            </div>
          )}
          {leave.notes && (
            <div className="text-[11px] mt-0.5 italic" style={{ color: "#737373" }}>
              {leave.notes}
            </div>
          )}
        </div>
        {isManager && onCancel && (
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
  onClose,
  onSaved,
}: {
  team: TeamMember[];
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
  const willCompensate = days >= 8;

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
          Si las vacaciones duran 8+ días, los pacientes RECUPERA y CONSOLIDA de esa persona recibirán automáticamente días extra en su suscripción.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Profesional</label>
            <select
              className="input text-sm w-full"
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
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
                ? `Se sumarán +${days} días al periodo activo de cada paciente RECUPERA/CONSOLIDA asignado.`
                : "No habrá compensación a pacientes (mínimo 8 días)."}
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
