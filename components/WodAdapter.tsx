"use client";

import { useEffect, useRef, useState } from "react";
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

// Persistimos el último WOD adaptado en localStorage POR PACIENTE. Petición
// del CEO: los atletas suelen pegar el WOD la noche de antes para hacerse una
// idea, y al día siguiente se les habia perdido. Ahora se queda fijo hasta
// que pulsen "Limpiar" o registren la sesión al terminar.
const STORAGE_PREFIX = "fisio-wod-adapter-v1:";

type StoredState = {
  rawText: string;
  adapted: AdaptedLine[] | null;
  rpe: number | null;
  pain: number;
  savedAt: string;
};

function storageKey(patientId: string): string {
  return `${STORAGE_PREFIX}${patientId}`;
}

function loadFromStorage(patientId: string): StoredState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(patientId));
    return raw ? (JSON.parse(raw) as StoredState) : null;
  } catch { return null; }
}

function saveToStorage(patientId: string, s: Omit<StoredState, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(patientId), JSON.stringify({ ...s, savedAt: new Date().toISOString() }));
  } catch { /* localStorage lleno o modo privado — no bloqueamos */ }
}

function clearStorage(patientId: string) {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(storageKey(patientId)); } catch { /* noop */ }
}

export function WodAdapter({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [adapted, setAdapted] = useState<AdaptedLine[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [rpe, setRpe] = useState<number | null>(null);
  const [pain, setPain] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  // Foto a la pizarra
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [reading, setReading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  // Hidratar desde localStorage al montar
  useEffect(() => {
    const s = loadFromStorage(patientId);
    if (s) {
      if (s.rawText) setRawText(s.rawText);
      if (s.adapted) setAdapted(s.adapted);
      if (s.rpe !== null && s.rpe !== undefined) setRpe(s.rpe);
      if (typeof s.pain === "number") setPain(s.pain);
      if (s.savedAt) setRestoredAt(s.savedAt);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  // Persistir cuando cambia algo. Solo después de la hidratación para no
  // machacar los datos guardados con el estado inicial vacío en el primer render.
  useEffect(() => {
    if (!hydrated) return;
    // Si todo está vacío no persistimos (dejamos que "Limpiar" borre).
    if (!rawText.trim() && !adapted && rpe === null && pain === 0) return;
    saveToStorage(patientId, { rawText, adapted, rpe, pain });
  }, [hydrated, patientId, rawText, adapted, rpe, pain]);

  function resetLocal() {
    setRawText("");
    setAdapted(null);
    setRpe(null);
    setPain(0);
    setShowLog(false);
    setImgError(null);
    setRestoredAt(null);
    clearStorage(patientId);
  }

  async function readFromPhoto(file: File) {
    setImgError(null);
    setReading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const r = await fetch("/api/wod/from-image", { method: "POST", body: form });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setImgError(data?.error || "No se pudo leer la foto");
        return;
      }
      const text = String(data?.text ?? "").trim();
      if (!text) {
        setImgError("La foto no devolvió texto");
        return;
      }
      // Si ya había algo escrito, añadimos una separación; si no, sustituimos.
      setRawText((prev) => prev.trim() ? `${prev.trim()}\n\n${text}` : text);
    } catch (e: any) {
      setImgError(e?.message || "Error subiendo la foto");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

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
    resetLocal();
    router.refresh();
    alert("Sesión registrada ✅");
  }

  const hasBlocked = adapted?.some((l) => l.state === "BLOCKED");
  const hasWarnings = adapted?.some((l) => l.state === "CONDITIONAL" || l.physioWarning);
  const hasUnmatched = adapted?.some((l) => l.unmatched);

  return (
    <>
      <section className="card mb-3">
        <div className="flex justify-between items-center mb-1 gap-2 flex-wrap">
          <label className="block text-xs text-neutral-500">WOD del entrenador</label>
          <div className="flex gap-2 items-center">
            {rawText && (
              <button
                type="button"
                onClick={resetLocal}
                className="text-[11px] text-neutral-400 hover:text-red-600"
              >
                Limpiar
              </button>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={reading || loading}
              className="text-xs px-2 py-1 rounded bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50"
              title="Haz una foto de la pizarra o elige una imagen de la galería"
            >
              {reading ? "Leyendo pizarra…" : "📸 Foto o galería"}
            </button>
          </div>
        </div>
        {/* Sin `capture` para que el sistema (iOS/Android/web) muestre el
             selector con ambas opciones: cámara y galería. El atleta puede
             estar en el box (foto directa) o revisar en casa una foto que ya
             hizo antes (galería). */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) readFromPhoto(f);
          }}
        />
        <textarea
          className="input min-h-32 font-mono text-sm"
          placeholder="Pega o escribe aquí el WOD que ha puesto el coach (movimientos, cargas, formato). O usa 📸 Foto a la pizarra."
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
        {restoredAt && rawText && (
          <p className="text-[11px] text-neutral-500 mt-2 italic">
            💾 Recuperado de tu última sesión ({new Date(restoredAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}). Se queda guardado hasta que pulses <strong>Limpiar</strong> o lo registres al terminar.
          </p>
        )}
        {imgError && (
          <p className="text-xs text-red-600 mt-2">⚠️ {imgError}</p>
        )}
        {rawText && rawText.includes("[?]") && (
          <p className="text-[11px] text-amber-700 mt-2">
            La IA marcó con <code className="bg-amber-50 px-1">[?]</code> lo que no leyó claro. Revisa esas líneas antes de adaptar.
          </p>
        )}
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
