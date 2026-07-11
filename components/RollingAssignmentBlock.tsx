"use client";

import { useEffect, useState } from "react";

type RollingProgram = { id: string; name: string; typeId: string | null };

export function RollingAssignmentBlock({
  patientId,
  programType,
  programMode,
  currentRollingProgramId,
  currentAccessoriesId,
  currentTrainingId,
  currentCustomId,
  isManager,
}: {
  patientId: string;
  programType: string;
  programMode: string;
  /** Slot legacy (1 solo rolling) — solo usado si los nuevos están vacíos */
  currentRollingProgramId: string | null;
  /** Slot Accesorios */
  currentAccessoriesId: string | null;
  /** Slot Entrenamiento */
  currentTrainingId: string | null;
  /** Slot personalizado (tipo custom, ej. FisioFit Hybrid) */
  currentCustomId?: string | null;
  isManager: boolean;
}) {
  const [programs, setPrograms] = useState<RollingProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [selectedMode, setSelectedMode] = useState<"fixed" | "rolling">(programMode as any);
  const [accessoriesId, setAccessoriesId] = useState(currentAccessoriesId || "");
  const [trainingId, setTrainingId] = useState(currentTrainingId || currentRollingProgramId || "");
  const [customId, setCustomId] = useState(currentCustomId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/rolling-programs")
      .then((r) => r.json())
      .then((data) => {
        setPrograms(
          data
            .filter((p: any) => p.isActive)
            .map((p: any) => ({ id: p.id, name: p.name, typeId: p.typeId ?? null })),
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Los programas "personalizados" son los que tienen un typeId asignado.
  const customPrograms = programs.filter((p) => !!p.typeId);
  const standardPrograms = programs.filter((p) => !p.typeId);

  // Solo mostrar el bloque si es ADVANCE (los demás programas no admiten rolling)
  if (programType !== "ADVANCE") return null;

  const accProgram = programs.find((p) => p.id === (currentAccessoriesId || ""));
  const trnProgram = programs.find((p) => p.id === (currentTrainingId || currentRollingProgramId || ""));
  const cusProgram = programs.find((p) => p.id === (currentCustomId || ""));

  async function save() {
    if (selectedMode === "rolling" && !accessoriesId && !trainingId && !customId) {
      setError("Selecciona al menos un programa rolling (Accesorios, Entrenamiento o Personalizado)");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/patients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: patientId,
        programMode: selectedMode,
        rollingAccessoriesId: selectedMode === "rolling" ? (accessoriesId || null) : null,
        rollingTrainingId: selectedMode === "rolling" ? (trainingId || null) : null,
        rollingCustomId: selectedMode === "rolling" ? (customId || null) : null,
        // Limpiar el legacy: ya no lo usamos
        rollingProgramId: null,
      }),
    });
    if (res.ok) {
      window.location.reload();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo actualizar");
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px dashed #E5E5E5" }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Programas Rolling de ADVANCE</h3>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs hover:underline"
            style={{ color: "#525252" }}
          >
            Cambiar
          </button>
        )}
      </div>

      {!editing && (
        <div className="rounded-lg p-3 text-sm" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
          {programMode === "rolling" ? (
            <div className="space-y-2.5">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#DBEAFE", color: "#1E40AF" }}>
                    ACCESORIOS
                  </span>
                  <span className="font-medium">{accProgram?.name || (currentAccessoriesId ? "(archivado)" : "—")}</span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#FEF3C7", color: "#7C2D12" }}>
                    ENTRENAMIENTO
                  </span>
                  <span className="font-medium">{trnProgram?.name || ((currentTrainingId || currentRollingProgramId) ? "(archivado)" : "—")}</span>
                </div>
              </div>
              {(currentCustomId || cusProgram) && (
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#EDE9FE", color: "#5B21B6" }}>
                      PERSONALIZADO
                    </span>
                    <span className="font-medium">{cusProgram?.name || (currentCustomId ? "(archivado)" : "—")}</span>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-neutral-500 mt-1.5">
                Ve cada día las sesiones de los programas asignados. Sin métricas, sin pausas.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#F5F5F5", color: "#525252" }}>
                  INDIVIDUAL
                </span>
                <span className="font-medium">Programa fijo</span>
              </div>
              <p className="text-[11px] text-neutral-500">
                Programa con sus propias semanas, métricas y posibilidad de pausas.
              </p>
            </>
          )}
        </div>
      )}

      {editing && (
        <div className="rounded-lg p-3" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
          <div className="flex gap-1 mb-3">
            <button
              type="button"
              onClick={() => setSelectedMode("fixed")}
              className={`flex-1 text-xs px-2 py-2 rounded border font-medium ${
                selectedMode === "fixed" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
              }`}
            >
              Individual (fijo)
            </button>
            <button
              type="button"
              onClick={() => setSelectedMode("rolling")}
              className={`flex-1 text-xs px-2 py-2 rounded border font-medium ${
                selectedMode === "rolling" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
              }`}
            >
              Rolling
            </button>
          </div>

          {selectedMode === "rolling" && (
            <>
              {loading ? (
                <p className="text-xs text-neutral-500 italic">Cargando programas...</p>
              ) : programs.length === 0 ? (
                <div className="text-xs p-2 rounded" style={{ background: "#FEF3C7", color: "#7C2D12" }}>
                  No hay programas rolling activos. <a href="/fisio/advance/rolling" className="underline font-medium">Crear uno primero</a>.
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div>
                    <label className="text-xs text-neutral-500 block mb-1">
                      <span className="font-medium text-neutral-800">Accesorios</span>
                      <span className="text-[10px] ml-1.5">(calentamiento/movilidad, compartido con PREVENTION)</span>
                    </label>
                    <select
                      className="input text-sm w-full"
                      value={accessoriesId}
                      onChange={(e) => setAccessoriesId(e.target.value)}
                    >
                      <option value="">— Sin programa de accesorios —</option>
                      {programs.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-neutral-500 block mb-1">
                      <span className="font-medium text-neutral-800">Entrenamiento</span>
                      <span className="text-[10px] ml-1.5">(sesión principal de ADVANCE)</span>
                    </label>
                    <select
                      className="input text-sm w-full"
                      value={trainingId}
                      onChange={(e) => setTrainingId(e.target.value)}
                    >
                      <option value="">— Sin programa de entrenamiento —</option>
                      {(standardPrograms.length ? standardPrograms : programs).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {customPrograms.length > 0 && (
                    <div>
                      <label className="text-xs text-neutral-500 block mb-1">
                        <span className="font-medium text-neutral-800">Personalizado</span>
                        <span className="text-[10px] ml-1.5">(programas de tipo custom, ej. FisioFit Hybrid)</span>
                      </label>
                      <select
                        className="input text-sm w-full"
                        value={customId}
                        onChange={(e) => setCustomId(e.target.value)}
                      >
                        <option value="">— Sin programa personalizado —</option>
                        {customPrograms.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <p className="text-[10px] italic text-neutral-500">
                    Tienes que asignar al menos uno.
                  </p>
                </div>
              )}
            </>
          )}

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                setEditing(false);
                setSelectedMode(programMode as any);
                setAccessoriesId(currentAccessoriesId || "");
                setTrainingId(currentTrainingId || currentRollingProgramId || "");
                setCustomId(currentCustomId || "");
                setError("");
              }}
              className="flex-1 text-xs px-3 py-2 rounded-md"
              style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 text-xs font-medium px-3 py-2 rounded-md"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
