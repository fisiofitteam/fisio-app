"use client";

import { useState } from "react";

type CaseData = {
  id: string;
  status: string;
  situation: string | null;
  proposedSolutions: string | null;
  consensusSolution: string | null;
};

const STATUS_OPTIONS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "supervision", label: "En supervisión" },
  { value: "resuelto", label: "Resuelto" },
];

export function PatientClinicalCasePanel({
  caseData,
  fisioName,
  bodyZone,
}: {
  caseData: CaseData;
  fisioName: string;
  bodyZone: string | null;
}) {
  const [status, setStatus] = useState(caseData.status);
  const [situation, setSituation] = useState(caseData.situation ?? "");
  const [proposed, setProposed] = useState(caseData.proposedSolutions ?? "");
  const [consensus, setConsensus] = useState(caseData.consensusSolution ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/clinical-cases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: caseData.id, status, situation, proposedSolutions: proposed, consensusSolution: consensus }),
    });
    if (res.ok) {
      setSavedAt(new Date());
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "No se pudo guardar.");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-medium">🧠 Sesión clínica</h2>
          <div className="flex items-center gap-2">
            {savedAt && <span className="text-xs text-neutral-400">Guardado ✓</span>}
            <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          Lo comentado sobre este paciente en la sesión clínica del equipo. Se sincroniza con Reuniones.
        </p>

        <div className="bg-neutral-50 rounded-lg p-3 text-sm grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] uppercase text-neutral-500">Fisioterapeuta</div>
            <div className="font-medium">{fisioName}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-neutral-500">Zona corporal</div>
            <div className="font-medium">{bodyZone || "—"}</div>
          </div>
        </div>

        <div>
          <label className="text-xs text-neutral-500 block mb-1">Estado</label>
          <select className="input text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Descripción de la situación</label>
          <textarea className="input text-sm" rows={3} value={situation} onChange={(e) => setSituation(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Soluciones propuestas</label>
          <textarea className="input text-sm" rows={3} value={proposed} onChange={(e) => setProposed(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Solución consensuada</label>
          <textarea className="input text-sm" rows={3} value={consensus} onChange={(e) => setConsensus(e.target.value)} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>
    </div>
  );
}
