"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isWodReadiness, usesWodReadiness, WOD_READINESS_OPTIONS, type WodReadiness } from "@/lib/wod-readiness";
import { WodReadinessBadge } from "@/components/WodReadinessBadge";

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
// idea, y al día siguiente se les habia perdido. El borrador se conserva hasta
// limpiar o registrar. RECUPERA/CONSOLIDA confirman su estado en cada apertura
// y generan una nueva adaptación, sin restaurar un color o resultado anterior.
const STORAGE_PREFIX = "fisio-wod-adapter-v1:";

type StoredState = {
  rawText: string;
  adapted: AdaptedLine[] | null;
  rpe: number | null;
  pain: number;
  notes?: string;
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

const readinessStyles: Record<WodReadiness, { card: string; dot: string }> = {
  RED: { card: "border-red-600 bg-red-50 text-red-950", dot: "bg-red-600" },
  AMBER: { card: "border-amber-500 bg-amber-50 text-amber-950", dot: "bg-amber-500" },
  GREEN: { card: "border-emerald-600 bg-emerald-50 text-emerald-950", dot: "bg-emerald-600" },
};

export function WodAdapter({ patientId, programType, preamble }: { patientId: string; programType?: string | null; preamble?: ReactNode }) {
  const router = useRouter();
  const requiresReadiness = usesWodReadiness(programType);
  const [readiness, setReadiness] = useState<WodReadiness | null>(null);
  const [readinessConfirmed, setReadinessConfirmed] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [adaptedReadiness, setAdaptedReadiness] = useState<WodReadiness | null>(null);
  const [adaptedRawText, setAdaptedRawText] = useState<string | null>(null);
  const [adaptedDay, setAdaptedDay] = useState<string | null>(null);
  const [adaptError, setAdaptError] = useState<string | null>(null);
  const adaptationRequest = useRef(0);
  const [rawText, setRawText] = useState("");
  const [adapted, setAdapted] = useState<AdaptedLine[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [rpe, setRpe] = useState<number | null>(null);
  const [pain, setPain] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  // Foto a la pizarra
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [reading, setReading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  // The text draft survives reopening. Daily readiness and its result do not.
  useEffect(() => {
    adaptationRequest.current++;
    const s = loadFromStorage(patientId);
    const restoredText = typeof s?.rawText === "string" ? s.rawText : "";
    const restoredAdapted = !requiresReadiness && Array.isArray(s?.adapted) ? s.adapted : null;
    setRawText(restoredText);
    setAdapted(restoredAdapted);
    setAdaptedRawText(restoredAdapted ? restoredText : null);
    setAdaptedReadiness(null);
    setAdaptedDay(null);
    setReadiness(null);
    setSelectedDay(null);
    setReadinessConfirmed(false);
    setShowLog(false);
    setLoading(false);
    setAdaptError(null);
    setLogError(null);
    setRpe(typeof s?.rpe === "number" ? s.rpe : null);
    setPain(typeof s?.pain === "number" ? s.pain : 0);
    setNotes(typeof s?.notes === "string" ? s.notes : "");
    setRestoredAt(typeof s?.savedAt === "string" ? s.savedAt : null);
    setHydratedFor(patientId);
    return () => { adaptationRequest.current++; };
  }, [patientId, requiresReadiness]);

  useEffect(() => {
    if (hydratedFor !== patientId) return;
    if (!rawText.trim() && !adapted && rpe === null && pain === 0 && !notes.trim()) return;
    saveToStorage(patientId, { rawText, adapted: requiresReadiness ? null : adapted, rpe, pain, notes });
  }, [hydratedFor, patientId, requiresReadiness, rawText, adapted, rpe, pain, notes]);

  function invalidateAdaptation() {
    adaptationRequest.current++;
    setAdapted(null);
    setAdaptedRawText(null);
    setAdaptedReadiness(null);
    setAdaptedDay(null);
    setShowLog(false);
    setLoading(false);
    setAdaptError(null);
    setLogError(null);
  }

  function resetExpiredReadiness() {
    if (!requiresReadiness || !selectedDay || selectedDay === new Date().toDateString()) return false;
    setReadiness(null);
    setSelectedDay(null);
    setReadinessConfirmed(false);
    invalidateAdaptation();
    setAdaptError("Confirma cómo estás hoy y vuelve a adaptar el WOD.");
    return true;
  }

  useEffect(() => {
    if (!requiresReadiness || !selectedDay) return;
    const checkDay = () => { resetExpiredReadiness(); };
    const checkVisibleDay = () => { if (document.visibilityState === "visible") checkDay(); };
    window.addEventListener("focus", checkDay);
    document.addEventListener("visibilitychange", checkVisibleDay);
    return () => {
      window.removeEventListener("focus", checkDay);
      document.removeEventListener("visibilitychange", checkVisibleDay);
    };
    // Only a date change resets the selection; normal refocusing preserves it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiresReadiness, selectedDay]);

  function changeReadiness(value: WodReadiness) {
    const today = new Date().toDateString();
    if (value === readiness && selectedDay === today) return;
    setReadiness(value);
    setSelectedDay(today);
    invalidateAdaptation();
  }

  function resetLocal() {
    setRawText("");
    setReadiness(null);
    setSelectedDay(null);
    setReadinessConfirmed(false);
    invalidateAdaptation();
    setRpe(null);
    setPain(0);
    setNotes("");
    setImgError(null);
    setRestoredAt(null);
    clearStorage(patientId);
  }

  async function readFromPhoto(file: File) {
    invalidateAdaptation();
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
      invalidateAdaptation();
    } catch (e: any) {
      setImgError(e?.message || "Error subiendo la foto");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function adapt() {
    if (!rawText.trim() || saving || reading || resetExpiredReadiness()) return;
    if (requiresReadiness && (!readinessConfirmed || !isWodReadiness(readiness))) {
      setAdaptError("Selecciona cómo estás hoy antes de adaptar el WOD.");
      return;
    }
    invalidateAdaptation();
    const request = ++adaptationRequest.current;
    const requestedReadiness = requiresReadiness ? readiness : null;
    setLoading(true);
    try {
      const res = await fetch("/api/wod/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, rawText, readiness: requestedReadiness }),
      });
      const data = await res.json().catch(() => ({}));
      if (request !== adaptationRequest.current) return;
      if (!res.ok) throw new Error(data.error || "No se pudo adaptar el WOD. Vuelve a intentarlo.");
      if (!Array.isArray(data.lines) || (requiresReadiness && data.readiness !== requestedReadiness)) {
        throw new Error("La adaptación no coincide con tu selección. Vuelve a adaptar el WOD.");
      }
      setAdapted(data.lines);
      setAdaptedRawText(rawText);
      setAdaptedReadiness(requestedReadiness);
      setAdaptedDay(new Date().toDateString());
    } catch (error) {
      if (request === adaptationRequest.current) setAdaptError(error instanceof Error ? error.message : "No se pudo adaptar el WOD.");
    } finally {
      if (request === adaptationRequest.current) setLoading(false);
    }
  }

  async function logSession() {
    if (reading || saving || loading || resetExpiredReadiness()) return;
    if (!adapted || adaptedRawText !== rawText || (requiresReadiness && (!readinessConfirmed || !isWodReadiness(adaptedReadiness) || adaptedReadiness !== readiness))) {
      setLogError("Adapta el WOD con tu selección actual antes de registrarlo.");
      return;
    }
    if (requiresReadiness && adaptedDay !== new Date().toDateString()) {
      setReadiness(null);
      setSelectedDay(null);
      setReadinessConfirmed(false);
      invalidateAdaptation();
      setAdaptError("Confirma cómo estás hoy y vuelve a adaptar el WOD.");
      return;
    }
    setSaving(true);
    const adaptedText = adapted
      .map((line) => {
        const substitution = line.substitutionText || (line.state === "BLOCKED" || line.state === "CONDITIONAL" ? "(adapta)" : null);
        return `${line.raw}${substitution ? "  →  " + substitution : ""}${line.adaptedLoad ? " · Carga máx: " + line.adaptedLoad : ""}`;
      })
      .join("\n");

    setLogError(null);
    try {
      const response = await fetch("/api/wod/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, rawText, adaptedText, readiness: requiresReadiness ? adaptedReadiness : null, rpe, painScore: pain, notes: notes.trim() || null }),
      });
      if (!response.ok) throw new Error("No se pudo guardar el WOD. Tu registro sigue aquí; vuelve a intentarlo.");
      resetLocal();
      router.refresh();
      alert("Sesión registrada ✅ Ya puedes consultarla en tu historial de WODs.");
    } catch (error) {
      setLogError(error instanceof Error ? error.message : "No se pudo guardar. Vuelve a intentarlo.");
    } finally {
      setSaving(false);
    }
  }

  const hasBlocked = adapted?.some((l) => l.state === "BLOCKED");
  const hasWarnings = adapted?.some((l) => l.state === "CONDITIONAL" || l.physioWarning);
  const hasUnmatched = adapted?.some((l) => l.unmatched);

  return (
    <>
      {requiresReadiness && !readinessConfirmed && (
        <fieldset className="card mb-3" disabled={saving}>
          <legend className="sr-only">¿Cómo estás hoy?</legend>
          <h2 className="text-base font-semibold">¿Cómo estás hoy?</h2>
          <div className="mt-1 space-y-2">
            {WOD_READINESS_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`block cursor-pointer rounded-xl border-2 p-3 transition-colors focus-within:ring-2 focus-within:ring-neutral-900 focus-within:ring-offset-2 ${readiness === option.value ? readinessStyles[option.value].card : "border-neutral-200 bg-white text-neutral-800"}`}
              >
                <input
                  type="radio"
                  name={`wod-readiness-${patientId}`}
                  value={option.value}
                  checked={readiness === option.value}
                  onChange={() => changeReadiness(option.value)}
                  className="sr-only"
                />
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className={`h-3 w-3 shrink-0 rounded-full ${readinessStyles[option.value].dot}`} aria-hidden />
                  {option.label}
                  {readiness === option.value && <span className="ml-auto" aria-hidden>✓</span>}
                </span>
                <span className="mt-1.5 block text-sm leading-relaxed">{option.description}</span>
              </label>
            ))}
          </div>
          {adaptError && <p role="alert" className="mt-3 text-sm text-red-700">{adaptError}</p>}
          <button
            type="button"
            disabled={!isWodReadiness(readiness)}
            onClick={() => { if (!resetExpiredReadiness() && isWodReadiness(readiness)) setReadinessConfirmed(true); }}
            className="btn btn-accent mt-4 w-full disabled:opacity-50"
          >
            Continuar
          </button>
        </fieldset>
      )}
      {(!requiresReadiness || readinessConfirmed) && (
        <>
          {requiresReadiness && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-neutral-900">
              <WodReadinessBadge readiness={readiness} />
              <button
                type="button"
                disabled={saving || reading}
                onClick={() => { setReadinessConfirmed(false); invalidateAdaptation(); }}
                className="rounded px-2 py-1 text-sm underline underline-offset-4 disabled:opacity-50"
              >
                Cambiar
              </button>
            </div>
          )}
          {preamble}
          <section className="card mb-3">
            <div className="flex justify-between items-center mb-1 gap-2 flex-wrap">
              <label className="block text-xs text-neutral-500">WOD del entrenador</label>
              <div className="flex gap-2 items-center">
                {rawText && (
                  <button
                    type="button"
                    onClick={resetLocal}
                    disabled={saving || reading}
                    className="text-[11px] text-neutral-400 hover:text-red-600"
                  >
                    Limpiar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={reading || loading || saving}
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
              disabled={saving}
              onChange={(e) => { setRawText(e.target.value); invalidateAdaptation(); }}
            />
            {restoredAt && rawText && (
              <p className="text-[11px] text-neutral-500 mt-2 italic">
                💾 Borrador recuperado ({new Date(restoredAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}). {requiresReadiness ? "Selecciona cómo estás hoy y vuelve a adaptarlo." : "Se conserva hasta que lo limpies o lo registres al terminar."}
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
            {adaptError && <p role="alert" className="mt-3 text-sm text-red-700">{adaptError}</p>}
            <button onClick={adapt} disabled={!rawText.trim() || loading || reading || saving || (requiresReadiness && !readiness)} className="btn btn-accent w-full mt-3">
              {loading ? "Adaptando..." : "⚡ Adaptar a mi caso"}
            </button>
          </section>

          {adapted && (
            <section className="card mb-3">
              <h2 className="font-medium mb-3">Tu versión adaptada</h2>
              {adaptedReadiness && <div className="mb-3"><WodReadinessBadge readiness={adaptedReadiness} /></div>}

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
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs text-neutral-600">{line.raw}</div>
                        {/* Muestra con qué movimiento del catálogo lo emparejó
                            el matcher — útil para detectar rápido si escogió
                            el ID equivocado (aparecería como OK sin razón). */}
                        {line.matchedMovementName && (
                          <div className="text-[10px] text-neutral-400 mt-0.5">
                            detectado como: {line.matchedMovementName}
                          </div>
                        )}
                      </div>
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
                  <div>
                    <label className="text-xs text-neutral-500 block mb-1">
                      Comentarios (opcional)
                    </label>
                    <textarea
                      className="input text-sm w-full"
                      rows={3}
                      placeholder="Ej: press hombro con 40kg (subí 2.5), thruster con miedo al final, sentí molestia lumbar leve…"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <p className="text-[10px] text-neutral-400 mt-1">
                      Pesos que usaste, sensaciones, si algo te costó — cualquier detalle ayuda a tu fisio.
                    </p>
                  </div>
                  {logError && <p role="alert" className="text-sm text-red-600">{logError}</p>}
                  <button onClick={logSession} disabled={saving || reading || loading} className="btn btn-primary w-full">
                    {saving ? "Guardando..." : "Enviar a mi fisio"}
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
