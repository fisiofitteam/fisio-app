"use client";

/**
 * Formulario del reporte mensual del equipo. Precarga el registro del mes
 * en curso si ya existe (permite editar hasta fin de mes). Autosave con
 * debounce de 800ms cada vez que cambia un campo; botón "Enviar" hace un
 * POST final con submit:true (valida obligatorios). Cambio visual claro
 * cuando el reporte del mes ya está enviado.
 */
import { useEffect, useRef, useState } from "react";
import { REPORT_FIELDS, SCALE_FIELDS, monthLabel, type ReportFieldKey, type ScaleFieldKey } from "@/lib/team-monthly-reports";

type ReportRow = {
  id: string;
  monthYear: string;
  submittedAt: string;
  updatedAt: string;
} & Record<ReportFieldKey, string | null> & Partial<Record<ScaleFieldKey, number | null>>;

const EMPTY_VALUES: Record<ReportFieldKey, string> = REPORT_FIELDS.reduce(
  (acc, f) => ({ ...acc, [f.key]: "" }),
  {} as Record<ReportFieldKey, string>,
);
const EMPTY_SCALES: Record<ScaleFieldKey, number | null> = SCALE_FIELDS.reduce(
  (acc, f) => ({ ...acc, [f.key]: null }),
  {} as Record<ScaleFieldKey, number | null>,
);

export function TeamMonthlyReportForm() {
  const [monthYear, setMonthYear] = useState<string>("");
  const [existingReport, setExistingReport] = useState<ReportRow | null>(null);
  const [values, setValues] = useState<Record<ReportFieldKey, string>>(EMPTY_VALUES);
  const [scales, setScales] = useState<Record<ScaleFieldKey, number | null>>(EMPTY_SCALES);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/team-monthly-reports")
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) {
          setStatus("error");
          setErrorMsg(d?.error ?? "No se pudo cargar el reporte");
          return;
        }
        setMonthYear(d.monthYear);
        if (d.report) {
          setExistingReport(d.report);
          const filled = { ...EMPTY_VALUES };
          for (const f of REPORT_FIELDS) {
            const v = d.report[f.key];
            if (typeof v === "string") filled[f.key] = v;
          }
          setValues(filled);
          const filledScales = { ...EMPTY_SCALES };
          for (const f of SCALE_FIELDS) {
            const v = d.report[f.key];
            if (typeof v === "number") filledScales[f.key] = v;
          }
          setScales(filledScales);
          setSubmitted(true);
        }
        setStatus("idle");
      })
      .catch((e) => {
        setStatus("error");
        setErrorMsg(e?.message ?? "Error de red");
      });
  }, []);

  async function persist(
    next: Record<ReportFieldKey, string>,
    nextScales: Record<ScaleFieldKey, number | null>,
    submit = false,
  ) {
    setStatus("saving");
    setErrorMsg(null);
    try {
      const r = await fetch("/api/team-monthly-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, ...nextScales, submit }),
      });
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setStatus("error");
        setErrorMsg(d?.hint || d?.error || "Error al guardar");
        return false;
      }
      setStatus("saved");
      setExistingReport(d.report);
      if (submit) setSubmitted(true);
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1200);
      return true;
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message ?? "Error de red");
      return false;
    }
  }

  function updateField(key: ReportFieldKey, v: string) {
    const next = { ...values, [key]: v };
    setValues(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next, scales, false), 800);
  }

  function updateScale(key: ScaleFieldKey, v: number) {
    const next = { ...scales, [key]: v };
    setScales(next);
    // Las escalas se guardan de inmediato (no hay que debouncear un click).
    persist(values, next, false);
  }

  function flushOnBlur() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      persist(values, scales, false);
    }
  }

  const missingRequired = REPORT_FIELDS
    .filter((f) => f.required)
    .filter((f) => !(values[f.key] ?? "").trim())
    .map((f) => f.label);
  const missingScales = SCALE_FIELDS
    .filter((f) => !scales[f.key])
    .map((f) => f.label);
  const canSubmit = missingRequired.length === 0 && missingScales.length === 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const ok = await persist(values, scales, true);
    if (ok) setShowConfirm(false);
  }

  if (status === "loading") {
    return <p className="text-sm text-neutral-500 italic">Cargando reporte…</p>;
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">📝 Reporte mensual</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Un reporte por mes — <b>{monthLabel(monthYear)}</b>. Se guarda automáticamente
            mientras escribes. Cuando esté completo, pulsa "Enviar".
          </p>
        </div>
        <div className="text-[11px] text-neutral-500">
          {status === "saving" && <span>guardando…</span>}
          {status === "saved" && <span className="text-emerald-600">✓ guardado</span>}
          {status === "error" && <span className="text-red-600">✕ error</span>}
        </div>
      </header>

      {submitted && (
        <div
          className="rounded-lg p-3 text-xs mb-4 flex items-start gap-2"
          style={{ background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0" }}
        >
          <span>✅</span>
          <span>
            Reporte enviado. Puedes seguir editándolo hasta fin de mes; los cambios se
            guardan automáticamente y CEO/head coach ven la última versión.
          </span>
        </div>
      )}

      {/* ── Escalas 1-5 (satisfacción, carga, tareas) ───────────────── */}
      <section className="mb-6 rounded-xl border p-4" style={{ borderColor: "#E5E5E5", background: "#FAFAFA" }}>
        <div className="mb-3">
          <div className="text-sm font-semibold">📊 Cómo te sientes este mes</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            Escala 1 → 5. Van todas obligatorias — es lo que agregamos mes a mes para ver tendencias.
          </div>
        </div>
        <div className="space-y-3">
          {SCALE_FIELDS.map((f) => (
            <div key={f.key} className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {f.label}
                  <span className="text-red-600 ml-1">*</span>
                </div>
                <div className="text-[10px] text-neutral-500 mt-0.5 flex items-center gap-1.5">
                  <span>1 · {f.low}</span>
                  <span>—</span>
                  <span>5 · {f.high}</span>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = scales[f.key] === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => updateScale(f.key, n)}
                      className="w-9 h-9 rounded-md text-sm font-semibold border transition"
                      style={{
                        background: active ? "#0A0A0A" : "#FFFFFF",
                        color: active ? "#FAFAFA" : "#171717",
                        borderColor: active ? "#0A0A0A" : "#E5E5E5",
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-5">
        {REPORT_FIELDS.map((f, i) => (
          <div key={f.key}>
            <label className="text-sm font-medium block mb-1.5">
              <span className="text-neutral-400 mr-1">{i + 1}.</span>
              {f.label}
              {f.required && <span className="text-red-600 ml-1">*</span>}
            </label>
            {f.type === "long" ? (
              <textarea
                value={values[f.key]}
                onChange={(e) => updateField(f.key, e.target.value)}
                onBlur={flushOnBlur}
                rows={4}
                maxLength={5000}
                className="w-full text-sm p-2.5 rounded-lg border"
                style={{ borderColor: "#E5E5E5", background: "#FFFFFF", lineHeight: 1.5 }}
                placeholder={f.required ? "Obligatorio" : "Opcional — puedes dejarlo en blanco"}
              />
            ) : (
              <input
                type="url"
                value={values[f.key]}
                onChange={(e) => updateField(f.key, e.target.value)}
                onBlur={flushOnBlur}
                maxLength={5000}
                className="w-full text-sm p-2.5 rounded-lg border"
                style={{ borderColor: "#E5E5E5", background: "#FFFFFF" }}
                placeholder="https://…"
              />
            )}
          </div>
        ))}
      </div>

      {errorMsg && (
        <div className="mt-4 rounded-lg p-3 text-xs" style={{ background: "#FEE2E2", color: "#7F1D1D", border: "1px solid #FCA5A5" }}>
          ⚠ {errorMsg}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => (canSubmit ? setShowConfirm(true) : null)}
          disabled={!canSubmit || status === "saving"}
          className="text-sm font-semibold px-4 py-2.5 rounded-lg disabled:opacity-40"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          title={!canSubmit ? `Faltan: ${[...missingRequired, ...missingScales].join(", ")}` : ""}
        >
          {submitted ? "✓ Reenviar con cambios" : "Enviar reporte"}
        </button>
        {!canSubmit && (
          <span className="text-xs text-neutral-500">
            Faltan {missingRequired.length + missingScales.length} campo{missingRequired.length + missingScales.length === 1 ? "" : "s"} obligatorio{missingRequired.length + missingScales.length === 1 ? "" : "s"} ({missingScales.length > 0 && `${missingScales.length} escala${missingScales.length === 1 ? "" : "s"}`}{missingScales.length > 0 && missingRequired.length > 0 && ", "}{missingRequired.length > 0 && `${missingRequired.length} texto${missingRequired.length === 1 ? "" : "s"}`}).
          </span>
        )}
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-base mb-1">Enviar reporte de {monthLabel(monthYear)}</h3>
            <p className="text-sm text-neutral-600 mb-4">
              CEO y head coach lo verán al momento. Podrás seguir editándolo durante el
              mes; los cambios se guardan automáticamente.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} className="text-sm px-3 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50">
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={status === "saving"}
                className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
                style={{ background: "#0A0A0A", color: "#FAFAFA" }}
              >
                {status === "saving" ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
