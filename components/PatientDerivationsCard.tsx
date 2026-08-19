"use client";

import { useEffect, useState } from "react";

/**
 * Card en la ficha clínica del paciente: gestiona las DERIVACIONES.
 *
 * Una derivación permite que otro fisio vea/edite la ficha sin ser el
 * titular (assignedProfessionalId). NO cuenta para las métricas del fisio
 * derivado — es colaboración pura.
 *
 * Solo el fisio asignado o managers ven las acciones (Añadir/Revocar). El
 * resto (incluido el fisio derivado) solo ve la lista informativa.
 */

type Pro = { id: string; fullName: string; role: string };
type Derivation = {
  id: string;
  note: string | null;
  createdAt: string;
  to: Pro;
  from: { id: string; fullName: string };
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export function PatientDerivationsCard({
  patientId,
  canManage,
  availableProfessionals,
}: {
  patientId: string;
  canManage: boolean;
  availableProfessionals: Pro[];
}) {
  const [derivations, setDerivations] = useState<Derivation[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedPro, setSelectedPro] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/patients/${patientId}/derivations`);
    if (r.ok) {
      const d = await r.json();
      setDerivations(d.derivations);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  async function submit() {
    if (!selectedPro) return;
    setSubmitting(true);
    setError(null);
    const r = await fetch(`/api/patients/${patientId}/derivations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toProfessionalId: selectedPro, note: note || null }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d?.error ?? "No se pudo crear la derivación");
      setSubmitting(false);
      return;
    }
    setDerivations((prev) => [d.derivation, ...prev]);
    setAdding(false);
    setSelectedPro("");
    setNote("");
    setSubmitting(false);
  }

  async function revoke(id: string, name: string) {
    if (!confirm(`¿Revocar la derivación a ${name}? Perderá el acceso a este paciente.`)) return;
    const r = await fetch(`/api/patients/${patientId}/derivations?id=${id}`, { method: "DELETE" });
    if (r.ok) setDerivations((prev) => prev.filter((x) => x.id !== id));
  }

  // Filtra pros ya derivados del selector
  const derivedIds = new Set(derivations.map((d) => d.to.id));
  const selectablePros = availableProfessionals.filter((p) => !derivedIds.has(p.id));

  return (
    <section className="mt-4 max-w-3xl mx-auto px-4">
      <div className="rounded-xl p-4" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold text-sm text-blue-900">🤝 Derivaciones</h3>
            <p className="text-xs text-blue-800/70 mt-0.5">
              Otros fisios con acceso a este paciente. No cuenta para sus métricas.
            </p>
          </div>
          {canManage && !adding && (
            <button
              onClick={() => { setAdding(true); setError(null); }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{ background: "#1E3A8A", color: "#FFFFFF" }}
            >
              + Añadir derivación
            </button>
          )}
        </div>

        {/* Formulario */}
        {adding && (
          <div className="rounded-lg p-3 mb-3" style={{ background: "#FFFFFF", border: "1px solid #C7D2FE" }}>
            <label className="text-[11px] text-neutral-500 block mb-1">Derivar a</label>
            <select
              className="input text-sm w-full mb-2"
              value={selectedPro}
              onChange={(e) => setSelectedPro(e.target.value)}
            >
              <option value="">— Elige un fisio —</option>
              {selectablePros.map((p) => (
                <option key={p.id} value={p.id}>{p.fullName}</option>
              ))}
            </select>
            <label className="text-[11px] text-neutral-500 block mb-1">Nota (opcional)</label>
            <textarea
              className="w-full text-sm p-2 rounded-lg mb-2"
              style={{ border: "1px solid #E5E5E5", minHeight: 60 }}
              placeholder="Ej. Me ayuda con el bloque de hombro."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
            {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setAdding(false); setError(null); }}
                disabled={submitting}
                className="text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ background: "#F5F5F5", color: "#171717" }}
              >
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={submitting || !selectedPro}
                className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
                style={{ background: "#1E3A8A", color: "#FFFFFF" }}
              >
                {submitting ? "Añadiendo…" : "Derivar"}
              </button>
            </div>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="text-xs text-neutral-500">Cargando…</div>
        ) : derivations.length === 0 ? (
          <div className="text-xs text-blue-800/60 italic">Sin derivaciones activas.</div>
        ) : (
          <div className="space-y-1.5">
            {derivations.map((d) => (
              <div key={d.id} className="rounded-lg p-2.5 flex items-start justify-between gap-3" style={{ background: "#FFFFFF", border: "1px solid #DBEAFE" }}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-800">{d.to.fullName}</div>
                  <div className="text-[10px] text-neutral-500">
                    Derivado por {d.from.fullName} · {formatDate(d.createdAt)}
                  </div>
                  {d.note && <div className="text-xs text-neutral-600 mt-1 italic">"{d.note}"</div>}
                </div>
                {canManage && (
                  <button
                    onClick={() => revoke(d.id, d.to.fullName)}
                    className="text-[11px] font-medium px-2 py-1 rounded-md text-red-700 hover:bg-red-50 shrink-0"
                    title="Revocar derivación"
                  >
                    ✕ Revocar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
