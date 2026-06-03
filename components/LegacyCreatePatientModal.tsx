"use client";

import { useState } from "react";

type ProInfo = { id: string; fullName: string; role: string };
type RollingProgram = { id: string; name: string };

const PROGRAM_TYPES = ["RECUPERA", "CONSOLIDA", "ADVANCE"];

/**
 * Modal "📥 Paciente existente" — usado SOLO para migrar pacientes que ya
 * tenemos fuera de la plataforma. Se diferencia del alta normal en:
 *   - No genera Transaction (no contamina las métricas de ingresos por alta).
 *   - No pide importe pagado.
 *   - Permite fijar la fecha de inicio del periodo ACTUAL (puede ser pasada).
 *   - Sigue creando el SubscriptionRenewal vigente, así el flujo de
 *     renovación funciona exactamente igual cuando toque.
 */
export function LegacyCreatePatientModal({
  professionals,
  rollingPrograms,
  onClose,
  onCreated,
}: {
  professionals: ProInfo[];
  rollingPrograms: RollingProgram[];
  onClose: () => void;
  onCreated: (patientId: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [assignedProfessionalId, setAssignedProfessionalId] = useState("");
  const [programType, setProgramType] = useState("RECUPERA");
  const [programMode, setProgramMode] = useState<"fixed" | "rolling">("fixed");
  const [rollingProgramId, setRollingProgramId] = useState("");
  const [subscriptionPeriodMonths, setSubscriptionPeriodMonths] = useState("4");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function selectProgramType(p: string) {
    setProgramType(p);
    if (p !== "ADVANCE") {
      setProgramMode("fixed");
      setRollingProgramId("");
    }
  }

  async function save() {
    setError("");
    if (!fullName.trim()) return setError("El nombre es obligatorio");
    if (!email.trim()) return setError("El email es obligatorio");
    if (!startDate) return setError("Fecha de inicio del periodo es obligatoria");
    if (programMode === "rolling" && !rollingProgramId) {
      return setError("Selecciona el programa rolling al que se enchufa");
    }
    setSaving(true);
    const res = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        legacy: true,
        fullName: fullName.trim(),
        email: email.trim(),
        shippingPhone: phone.trim() || null,
        diagnosis: diagnosis.trim() || null,
        assignedProfessionalId: assignedProfessionalId || null,
        programType,
        programMode,
        rollingProgramId: programMode === "rolling" ? rollingProgramId : null,
        subscriptionPeriodMonths: Number(subscriptionPeriodMonths) || 4,
        subscriptionStartDate: startDate,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      onCreated(data.patientId);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo crear el paciente");
      setSaving(false);
    }
  }

  // Fecha estimada de fin (visual)
  const periodEnd = (() => {
    if (!startDate) return null;
    const d = new Date(startDate);
    if (isNaN(d.getTime())) return null;
    const m = Number(subscriptionPeriodMonths) || 4;
    d.setMonth(d.getMonth() + m);
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  })();

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">📥 Paciente existente</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none px-2">✕</button>
        </div>
        <div className="rounded-lg p-2 mb-4 text-xs" style={{ background: "#FEF3C7", border: "1px solid #FCD34D", color: "#78350F" }}>
          Solo para migrar pacientes que ya tenemos fuera de la plataforma.
          No se cuenta como alta nueva ni se genera transacción.
          <br />
          Se le pedirá la <strong>dirección postal</strong> al paciente, pero no
          aparecerá en envíos pendientes (camiseta/parches) porque damos por
          hecho que ya los recibió.
        </div>

        {error && <div className="rounded-lg p-2 mb-3 text-xs text-red-700 bg-red-50 border border-red-200">{error}</div>}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre completo *</label>
            <input className="input text-sm" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Carlos Martínez" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Email *</label>
              <input className="input text-sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="carlos@email.com" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Teléfono</label>
              <input className="input text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+34 600 000 000" />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Programa contratado *</label>
            <div className="flex gap-1">
              {PROGRAM_TYPES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => selectProgramType(p)}
                  className={`text-xs px-2.5 py-1.5 rounded-full border font-medium ${
                    programType === p ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-500"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {programType === "ADVANCE" && (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Modo</label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setProgramMode("fixed")}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border ${programMode === "fixed" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-500"}`}
                  >
                    Fijo
                  </button>
                  <button
                    type="button"
                    onClick={() => setProgramMode("rolling")}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border ${programMode === "rolling" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-500"}`}
                  >
                    Rolling
                  </button>
                </div>
              </div>
              {programMode === "rolling" && (
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">Programa rolling *</label>
                  <select className="input text-sm" value={rollingProgramId} onChange={(e) => setRollingProgramId(e.target.value)}>
                    <option value="">— Selecciona —</option>
                    {rollingPrograms.map((rp) => <option key={rp.id} value={rp.id}>{rp.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Inicio periodo actual *</label>
              <input className="input text-sm" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Duración (meses) *</label>
              <input className="input text-sm" type="number" min={1} max={24} value={subscriptionPeriodMonths} onChange={(e) => setSubscriptionPeriodMonths(e.target.value)} />
            </div>
          </div>
          {periodEnd && (
            <p className="text-[11px] text-neutral-500 italic -mt-2">
              Renovará alrededor del <strong>{periodEnd}</strong>.
            </p>
          )}

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Diagnóstico / motivo</label>
            <input className="input text-sm" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Opcional" />
          </div>

          {professionals.length > 0 ? (
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Fisio asignado</label>
              <select className="input text-sm w-full" value={assignedProfessionalId} onChange={(e) => setAssignedProfessionalId(e.target.value)}>
                <option value="">— Sin asignar (asignar luego) —</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.role === "head_success" ? "⭐ " : "🩺 "}{p.fullName}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded px-3 py-2">
              Se te asignará automáticamente como fisio de este paciente.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 mt-2">
            <button onClick={onClose} className="text-sm text-neutral-500 px-3 py-2">Cancelar</button>
            <button
              onClick={save}
              disabled={saving}
              className="text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              {saving ? "Creando..." : "Migrar paciente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
