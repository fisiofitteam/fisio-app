"use client";

import { useEffect, useState } from "react";

type Pause = {
  id: string;
  startDate: string;
  endDate: string;
  actualEndDate: string | null;
  reason: string | null;
  status: string;
  daysExtended: number;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

// Clases Tailwind (remapeadas en modo oscuro) en vez de hex fijos claros, para que
// los bloques de pausa sean legibles tanto en claro como en oscuro.
function statusLabel(s: string): { text: string; box: string; label: string } {
  switch (s) {
    case "active":
      return { text: "⏸️ EN PAUSA", box: "bg-amber-50 border-amber-200", label: "text-amber-800" };
    case "scheduled":
      return { text: "PROGRAMADA", box: "bg-blue-50 border-blue-200", label: "text-blue-800" };
    case "ended":
      return { text: "FINALIZADA", box: "bg-neutral-100 border-neutral-200", label: "text-neutral-600" };
    case "cancelled":
      return { text: "CANCELADA", box: "bg-neutral-50 border-neutral-200", label: "text-neutral-500" };
    default:
      return { text: s, box: "bg-neutral-100 border-neutral-200", label: "text-neutral-600" };
  }
}

export function ProgramPausesBlock({ patientId, programMode }: { patientId: string; programMode: string }) {
  const [pauses, setPauses] = useState<Pause[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Pause | null>(null);

  async function reload() {
    setLoading(true);
    const res = await fetch(`/api/program-pauses?patientId=${patientId}`);
    if (res.ok) {
      const data = await res.json();
      // Las pausas canceladas no se muestran (siguen en BD por trazabilidad)
      setPauses(data.filter((p: Pause) => p.status !== "cancelled"));
    }
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, [patientId]);

  if (programMode === "rolling") {
    return (
      <div className="text-xs text-neutral-500 italic mt-2">
        Las pausas no se aplican a programas ADVANCE rolling.
      </div>
    );
  }

  const activeOrScheduled = pauses.filter((p) => p.status === "active" || p.status === "scheduled");

  async function cancel(pauseId: string) {
    if (!confirm("¿Cancelar esta pausa? Si ya estaba activa, se revertirá la extensión de suscripción.")) return;
    await fetch("/api/program-pauses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pauseId, action: "cancel" }),
    });
    reload();
  }

  async function endNow(pauseId: string) {
    if (!confirm("¿Finalizar la pausa hoy? El paciente vuelve a ver su programa a partir de mañana.")) return;
    await fetch("/api/program-pauses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pauseId, action: "end-now" }),
    });
    reload();
  }

  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px dashed #E5E5E5" }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Pausas del programa</h3>
        <button
          onClick={() => setCreating(true)}
          className="text-xs font-medium px-2.5 py-1.5 rounded-md"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          + Programar pausa
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-neutral-500 italic">Cargando...</p>
      ) : pauses.length === 0 ? (
        <p className="text-xs text-neutral-500 italic">
          Sin pausas registradas. Cuando el paciente se vaya de vacaciones, prográmasela aquí para que su suscripción se alargue gratis.
        </p>
      ) : (
        <div className="space-y-2">
          {pauses.map((p) => {
            const s = statusLabel(p.status);
            return (
              <div key={p.id} className={`rounded-lg px-3 py-2 text-sm border ${s.box}`}>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className={`text-[10px] font-bold tracking-wider ${s.label}`}>{s.text}</span>
                  {p.status === "scheduled" && (
                    <button onClick={() => cancel(p.id)} className="text-[11px] text-red-600 hover:underline">Cancelar</button>
                  )}
                  {p.status === "active" && (
                    <button onClick={() => endNow(p.id)} className="text-[11px] text-amber-700 hover:underline">Finalizar hoy</button>
                  )}
                </div>
                <div className="text-xs">
                  Del <strong>{formatDate(p.startDate)}</strong> al <strong>{formatDate(p.actualEndDate || p.endDate)}</strong>
                </div>
                {p.reason && <div className="text-[11px] text-neutral-600 mt-0.5">{p.reason}</div>}
                {p.daysExtended > 0 && (
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    +{p.daysExtended} días añadidos a la suscripción
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <CreatePauseModal
          patientId={patientId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
            window.location.reload(); // Refrescar también la fecha de renovación que mostramos arriba
          }}
        />
      )}
    </div>
  );
}

function CreatePauseModal({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (!startDate || !endDate) {
      setError("Elige fecha de inicio y fin");
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError("La fecha de fin debe ser posterior a la de inicio");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/program-pauses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, startDate, endDate, reason: reason.trim() || null }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se ha podido crear la pausa");
      setSaving(false);
    }
  }

  // Calcular días automáticamente
  const days = startDate && endDate ? Math.max(0, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000)) : 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">⏸️ Programar pausa</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Durante la pausa, el paciente verá un mensaje "Programa pausado". Su suscripción se alarga gratis los días que dure.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Fecha de inicio *</label>
            <input type="date" className="input text-sm w-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Fecha de vuelta *</label>
            <input type="date" className="input text-sm w-full" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <p className="text-[10px] text-neutral-500 mt-1 italic">
              Día en que vuelve a estar activo (no incluido en la pausa).
            </p>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Motivo (opcional)</label>
            <input type="text" className="input text-sm w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Vacaciones, lesión externa..." />
          </div>

          {days > 0 && (() => {
            const shiftDays = Math.ceil(days / 7) * 7;
            const weeks = shiftDays / 7;
            const extraDays = shiftDays - days;
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                <strong>{days} {days === 1 ? "día" : "días"}</strong> de pausa →{" "}
                el programa se desplaza <strong>{weeks} {weeks === 1 ? "semana" : "semanas"}</strong> ({shiftDays} días).
                {extraDays > 0 && (
                  <span style={{ color: "#737373" }}>
                    {" "}Las sesiones se retoman el mismo día de la semana ({extraDays} {extraDays === 1 ? "día extra" : "días extra"} de regalo).
                  </span>
                )}
              </div>
            );
          })()}

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          <button
            onClick={save}
            disabled={saving || !startDate || !endDate}
            className="w-full"
            style={{
              background: "#0A0A0A",
              color: "#FAFAFA",
              padding: 11,
              borderRadius: 10,
              fontWeight: 500,
              fontSize: 14,
              border: "none",
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Programando..." : "Programar pausa"}
          </button>
        </div>
      </div>
    </div>
  );
}
