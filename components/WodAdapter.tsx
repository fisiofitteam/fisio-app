"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AdaptedLine = {
  raw: string;
  matchedMovementId?: string;
  matchedMovementName?: string;
  reps?: string;
  load?: string;
  unmatched?: boolean;
  state?: "OK" | "CONDITIONAL" | "BLOCKED";
  substitutionText?: string | null;
  adaptedLoad?: string | null;
  physioWarning?: string | null;
};

const EXAMPLES = [
  { label: "Fran", text: '"Fran"\n21-15-9 for time\nThrusters 42,5 kg\nPull-ups' },
  { label: "Helen", text: '"Helen" 3 rondas\n400m run\n21 KB swing 24kg\n12 pull-ups' },
  { label: "EMOM", text: "EMOM 12 min\nA) 5 power cleans 50kg\nB) 10 burpees over bar\nC) 15 wall balls" },
];

export function WodAdapter({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [adapted, setAdapted] = useState<AdaptedLine[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [rpe, setRpe] = useState<number | null>(null);
  const [pain, setPain] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  async function adapt() {
    if (!rawText.trim()) return;
    setLoading(true);
    const res = await fetch("/api/wod/adapt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, rawText }),
    });
    const data = await res.json();
    setAdapted(data.lines);
    setLoading(false);
  }

  async function logSession() {
    setSaving(true);
    const adaptedText = (adapted ?? [])
      .map((l) =>
        l.state === "BLOCKED" || l.state === "CONDITIONAL"
          ? `${l.raw}  →  ${l.substitutionText ?? "(adapta)"}${l.adaptedLoad ? " · " + l.adaptedLoad : ""}`
          : l.raw
      )
      .join("\n");

    await fetch("/api/wod/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, rawText, adaptedText, rpe, painScore: pain, notes: "" }),
    });
    setSaving(false);
    setShowLog(false);
    setRawText("");
    setAdapted(null);
    setRpe(null);
    setPain(0);
    router.refresh();
    alert("Sesión registrada ✅");
  }

  const hasBlocked = adapted?.some((l) => l.state === "BLOCKED");
  const hasWarnings = adapted?.some((l) => l.state === "CONDITIONAL" || l.physioWarning);
  const hasUnmatched = adapted?.some((l) => l.unmatched);

  return (
    <>
      <section className="card mb-3">
        <label className="block text-xs text-neutral-500 mb-1">WOD del entrenador</label>
        <textarea
          className="input min-h-32 font-mono text-sm"
          placeholder='Ejemplo:&#10;"Fran"&#10;21-15-9 for time&#10;Thrusters 42,5 kg&#10;Pull-ups'
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
        <div className="flex gap-2 mt-2 flex-wrap">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => setRawText(ex.text)}
              className="text-xs px-2 py-1 bg-neutral-100 rounded hover:bg-neutral-200"
            >
              Cargar "{ex.label}"
            </button>
          ))}
        </div>
        <button onClick={adapt} disabled={!rawText.trim() || loading} className="btn btn-accent w-full mt-3">
          {loading ? "Adaptando..." : "⚡ Adaptar a mi caso"}
        </button>
      </section>

      {adapted && (
        <section className="card mb-3">
          <h2 className="font-medium mb-3">Tu versión adaptada</h2>

          {hasUnmatched && (
            <div className="bg-neutral-100 border border-neutral-200 rounded p-2 mb-3 text-xs text-neutral-600">
              Algunas líneas no las pude identificar. Revísalas con tu fisio si dudas.
            </div>
          )}

          {hasBlocked && (
            <div className="bg-red-50 border border-red-200 rounded p-2 mb-3 text-xs text-red-800">
              ⚠ Hay movimientos bloqueados — sigue las sustituciones.
            </div>
          )}

          <div className="space-y-2">
            {adapted.map((line, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg text-sm border ${
                  line.state === "BLOCKED"
                    ? "border-red-200 bg-red-50"
                    : line.state === "CONDITIONAL"
                    ? "border-amber-200 bg-amber-50"
                    : line.unmatched
                    ? "border-neutral-300 bg-neutral-50"
                    : "border-emerald-200 bg-emerald-50"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="font-mono text-xs text-neutral-600">{line.raw}</div>
                  {line.state && (
                    <span
                      className={
                        line.state === "OK"
                          ? "pill-ok"
                          : line.state === "CONDITIONAL"
                          ? "pill-warn"
                          : "pill-block"
                      }
                    >
                      {line.state === "OK" ? "OK" : line.state === "CONDITIONAL" ? "Cond." : "Bloq."}
                    </span>
                  )}
                  {line.unmatched && <span className="text-xs text-neutral-400">?</span>}
                </div>

                {line.substitutionText && (
                  <div className="mt-1 text-sm font-medium">
                    → {line.substitutionText}
                    {line.adaptedLoad && (
                      <span className="text-neutral-600 font-normal"> · {line.adaptedLoad}</span>
                    )}
                  </div>
                )}
                {!line.substitutionText && line.adaptedLoad && (
                  <div className="mt-1 text-sm">
                    Carga máx: <span className="font-medium">{line.adaptedLoad}</span>
                  </div>
                )}
                {line.physioWarning && (
                  <div className="mt-1 text-xs text-amber-900 italic">⚠ {line.physioWarning}</div>
                )}
              </div>
            ))}
          </div>

          {!showLog ? (
            <button onClick={() => setShowLog(true)} className="btn btn-primary w-full mt-4">
              ✓ Registrar al terminar
            </button>
          ) : (
            <div className="mt-4 space-y-3 border-t border-neutral-200 pt-4">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">RPE percibido (1-10)</label>
                <div className="flex gap-1">
                  {[5, 6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setRpe(n)}
                      className={`flex-1 py-2 text-xs rounded ${
                        rpe === n ? "bg-neutral-900 text-white" : "bg-neutral-100"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">
                  Dolor durante el WOD: {pain}/10
                </label>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={pain}
                  onChange={(e) => setPain(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <button onClick={logSession} disabled={saving} className="btn btn-primary w-full">
                {saving ? "Guardando..." : "Enviar a mi fisio"}
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
