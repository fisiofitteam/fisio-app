"use client";

import { useEffect, useState } from "react";

type Renewal = {
  id: string;
  programType: string | null;
  periodMonths: number;
  startDate: string | null;
  endDate: string | null;
  status: string;
  amountPaid: number | null;
  notes: string | null;
};

type Pause = {
  id: string;
  startDate: string;
  endDate: string;
  actualEndDate: string | null;
  status: string;
  reason: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  RECUPERA: { bg: "#FEF3C7", color: "#7C2D12" },
  CONSOLIDA: { bg: "#DBEAFE", color: "#1E40AF" },
  ADVANCE: { bg: "#E0F2FE", color: "#075985" },
};

export function SubscriptionPeriodsBlock({ patientId, isManager }: { patientId: string; isManager: boolean }) {
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [pauses, setPauses] = useState<Pause[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Renewal | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const [rRes, pRes] = await Promise.all([
      fetch(`/api/renewals?patientId=${patientId}`),
      fetch(`/api/program-pauses?patientId=${patientId}`),
    ]);
    const r = rRes.ok ? await rRes.json() : [];
    const p = pRes.ok ? await pRes.json() : [];
    setRenewals(r);
    setPauses(p.filter((x: Pause) => x.status !== "cancelled"));
    if (!silent) setLoading(false);
  }

  async function handleDelete(r: Renewal) {
    const label = r.programType ? `${r.programType}` : "periodo";
    if (!confirm(`¿Eliminar este ${label}?\n\nNo se puede deshacer.`)) return;
    const res = await fetch(`/api/renewals?id=${r.id}`, { method: "DELETE" });
    if (res.ok) {
      await load();
      window.location.reload(); // refresca el círculo del paciente
    } else {
      alert("No se pudo eliminar");
    }
  }

  useEffect(() => {
    // Saneamos al primer load (en silencio): elimina periodos basura
    // de versiones antiguas, cierra periodos vencidos, etc.
    (async () => {
      try {
        await fetch(`/api/renewals/sanitize?patientId=${patientId}`, { method: "POST" });
      } catch {}
      await load();
    })();
  }, [patientId]);

  // Para cada renewal, encontrar las pausas que cayeron dentro de ese periodo
  function pausesInsidePeriod(r: Renewal): Pause[] {
    if (!r.startDate || !r.endDate) return [];
    const periodStart = new Date(r.startDate).getTime();
    const periodEnd = new Date(r.endDate).getTime();
    return pauses.filter((p) => {
      const pStart = new Date(p.startDate).getTime();
      return pStart >= periodStart && pStart < periodEnd;
    });
  }

  return (
    <div className="mt-4 pt-4" style={{ borderTop: "1px dashed #E5E5E5" }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Periodos de suscripción</h3>
        {isManager && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-md"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            + Añadir renovación
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-neutral-500 italic">Cargando...</p>
      ) : renewals.length === 0 ? (
        <p className="text-xs text-neutral-500 italic">
          Sin periodos registrados. Cuando renueve el paciente, crea aquí el nuevo periodo.
        </p>
      ) : (
        <div className="space-y-2">
          {renewals.map((r, i) => {
            const periodPauses = pausesInsidePeriod(r);
            const typeColor = r.programType ? TYPE_COLORS[r.programType] : null;
            const isScheduled = r.status === "scheduled";
            return (
              <div
                key={r.id}
                className="rounded-lg px-3 py-2.5 text-sm"
                style={{
                  background: r.status === "active" ? "#FAFAFA" : isScheduled ? "#FFFBEB" : "#FFFFFF",
                  border: r.status === "active"
                    ? "1px solid #0A0A0A"
                    : isScheduled
                    ? "1px dashed #F59E0B"
                    : "1px solid #E5E5E5",
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                    <span className="text-xs font-bold tracking-wider" style={{ color: "#525252" }}>
                      PERIODO {i + 1}
                    </span>
                    {r.status === "active" && (
                      <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#0A0A0A", color: "#FAFAFA" }}>
                        ACTUAL
                      </span>
                    )}
                    {isScheduled && (
                      <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#F59E0B", color: "#FFFFFF" }}>
                        PROGRAMADO · empieza {formatDate(r.startDate)}
                      </span>
                    )}
                    {r.programType && typeColor && (
                      <span
                        className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: typeColor.bg, color: typeColor.color }}
                      >
                        {r.programType}
                      </span>
                    )}
                  </div>
                  {isManager && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setEditing(r)}
                        className="text-xs text-neutral-500 hover:text-neutral-900 px-1"
                        title="Editar"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDelete(r)}
                        className="text-xs text-neutral-500 hover:text-red-600 px-1"
                        title="Eliminar"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                <div className="text-xs flex items-baseline gap-3 flex-wrap" style={{ color: "#737373" }}>
                  <span>
                    {formatDate(r.startDate)} → {formatDate(r.endDate)}
                  </span>
                  {r.amountPaid != null && (
                    <span>
                      {r.amountPaid.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                    </span>
                  )}
                </div>

                {periodPauses.length > 0 && (
                  <div className="text-[10px] italic mt-1.5" style={{ color: "#737373" }}>
                    {periodPauses.map((p) => {
                      const days = daysBetween(p.startDate, p.actualEndDate || p.endDate);
                      return `Pausa ${days}d (${formatDate(p.startDate)} – ${formatDate(p.actualEndDate || p.endDate)})`;
                    }).join(" · ")}
                  </div>
                )}

                {r.notes && (
                  <div className="text-[11px] mt-1" style={{ color: "#737373" }}>
                    {r.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <AddRenewalModal
          patientId={patientId}
          activeRenewal={renewals.find((r) => r.status === "active") || null}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
            window.location.reload(); // Refrescar también el resto de la ficha
          }}
        />
      )}

      {editing && (
        <EditRenewalModal
          renewal={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

function AddRenewalModal({
  patientId,
  activeRenewal,
  onClose,
  onSaved,
}: {
  patientId: string;
  activeRenewal: Renewal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [programType, setProgramType] = useState("CONSOLIDA");
  const [periodMonths, setPeriodMonths] = useState("4");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Detectar solapamiento: hay activo que aún no ha vencido
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeEndsAt = activeRenewal?.endDate ? new Date(activeRenewal.endDate) : null;
  const hasOverlap = activeEndsAt && activeEndsAt > today;

  // Estrategia: "scheduled" (empieza al acabar el actual) o "replace" (sustituye al actual)
  const [strategy, setStrategy] = useState<"scheduled" | "replace">("scheduled");

  async function save() {
    setError("");
    setSaving(true);
    const res = await fetch("/api/renewals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId,
        programType,
        periodMonths: Number(periodMonths),
        amountPaid: amountPaid || null,
        notes: notes.trim() || null,
        strategy: hasOverlap ? strategy : undefined,
      }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo registrar la renovación");
      setSaving(false);
    }
  }

  function formatDateShort(d: Date | string | null): string {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">+ Añadir renovación</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        {!hasOverlap && (
          <p className="text-xs text-neutral-500 mb-4">
            El nuevo periodo empieza hoy.
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">¿A qué programa renueva?</label>
            <div className="flex gap-1">
              {["RECUPERA", "CONSOLIDA", "ADVANCE"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProgramType(p)}
                  className={`flex-1 text-xs px-2 py-2 rounded border font-medium ${
                    programType === p ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Duración (meses)</label>
              <select
                className="input text-sm w-full"
                value={periodMonths}
                onChange={(e) => setPeriodMonths(e.target.value)}
              >
                <option value="1">1 mes</option>
                <option value="2">2 meses</option>
                <option value="3">3 meses</option>
                <option value="4">4 meses</option>
                <option value="6">6 meses</option>
                <option value="12">12 meses</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Importe (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input text-sm w-full"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          {hasOverlap && (
            <div className="rounded-xl p-3" style={{ background: "#FFFBEB", border: "1px solid #FCD34D" }}>
              <div className="text-xs font-medium mb-2" style={{ color: "#92400E" }}>
                ⚠️ El paciente aún tiene periodo activo (acaba el {formatDateShort(activeEndsAt)})
              </div>
              <div className="text-xs mb-2" style={{ color: "#525252" }}>
                ¿Cuándo empieza el nuevo?
              </div>
              <div className="space-y-1.5">
                <label className="flex items-start gap-2 cursor-pointer text-xs">
                  <input
                    type="radio"
                    checked={strategy === "scheduled"}
                    onChange={() => setStrategy("scheduled")}
                    className="mt-0.5"
                  />
                  <span>
                    <strong>Al terminar el actual</strong> (el {formatDateShort(activeEndsAt)})<br />
                    <span style={{ color: "#737373" }}>Renovación anticipada. El paciente disfruta los dos periodos secuencialmente.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer text-xs">
                  <input
                    type="radio"
                    checked={strategy === "replace"}
                    onChange={() => setStrategy("replace")}
                    className="mt-0.5"
                  />
                  <span>
                    <strong>Sustituir al actual</strong> (empezar hoy)<br />
                    <span style={{ color: "#737373" }}>El periodo actual se elimina y este lo reemplaza. Usa esta opción si te equivocaste al crear el actual.</span>
                  </span>
                </label>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Notas (opcional)</label>
            <input
              type="text"
              className="input text-sm w-full"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cualquier nota del cierre"
            />
          </div>

          {amountPaid && Number(amountPaid) > 0 && (
            <p className="text-[11px] italic" style={{ color: "#737373" }}>
              💰 Se registrará como ingreso "Renovación" en Finanzas.
            </p>
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
            {saving ? "Guardando..." : "Registrar renovación"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditRenewalModal({
  renewal,
  onClose,
  onSaved,
}: {
  renewal: Renewal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [programType, setProgramType] = useState(renewal.programType || "CONSOLIDA");
  const [periodMonths, setPeriodMonths] = useState(String(renewal.periodMonths));
  const [startDate, setStartDate] = useState(renewal.startDate ? renewal.startDate.split("T")[0] : "");
  const [amountPaid, setAmountPaid] = useState(renewal.amountPaid != null ? String(renewal.amountPaid) : "");
  const [notes, setNotes] = useState(renewal.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    setSaving(true);
    const res = await fetch("/api/renewals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: renewal.id,
        programType,
        periodMonths: Number(periodMonths),
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        amountPaid: amountPaid === "" ? null : Number(amountPaid),
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
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Editar periodo</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Programa</label>
            <div className="flex gap-1">
              {["RECUPERA", "CONSOLIDA", "ADVANCE"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProgramType(p)}
                  className={`flex-1 text-xs px-2 py-2 rounded border font-medium ${
                    programType === p ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Fecha de inicio</label>
              <input
                type="date"
                className="input text-sm w-full"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Duración (meses)</label>
              <select
                className="input text-sm w-full"
                value={periodMonths}
                onChange={(e) => setPeriodMonths(e.target.value)}
              >
                <option value="1">1 mes</option>
                <option value="2">2 meses</option>
                <option value="3">3 meses</option>
                <option value="4">4 meses</option>
                <option value="6">6 meses</option>
                <option value="12">12 meses</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Importe (€)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input text-sm w-full"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder="0,00"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Notas</label>
            <input
              type="text"
              className="input text-sm w-full"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <p className="text-[11px] italic" style={{ color: "#737373" }}>
            La fecha de fin se recalcula automáticamente con el inicio + meses.
          </p>

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
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
