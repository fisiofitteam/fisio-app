"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AnamnesisField, AnamnesisStep } from "@/lib/onboarding-content";
import { PatientSessionMenu } from "@/components/PatientSessionMenu";

type Answers = Record<string, unknown>;

export function OnboardingFlow({
  patientId,
  firstName,
  initialTasks,
  initialAnamnesis,
  steps,
  contractText,
}: {
  patientId: string;
  firstName: string;
  initialTasks: { anamnesis: boolean; contract: boolean };
  initialAnamnesis: Answers;
  steps: AnamnesisStep[];
  contractText: string;
}) {
  const [tasks, setTasks] = useState(initialTasks);

  // Fase actual derivada del estado de tareas
  const phase: "anamnesis" | "contract" | "done" = !tasks.anamnesis
    ? "anamnesis"
    : !tasks.contract
    ? "contract"
    : "done";

  return (
    <div className="max-w-xl mx-auto px-4 py-8 pb-16">
      <header className="mb-6">
        <div className="flex justify-end mb-2">
          <PatientSessionMenu />
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">Bienvenido/a, {firstName}</h1>
        <p className="text-sm text-neutral-300">
          Antes de empezar necesitamos dos cosas: tu cuestionario inicial y la firma del contrato.
        </p>
      </header>

      {/* Indicador de las 2 fases */}
      <div className="flex items-center gap-2 mb-6">
        <PhasePill label="1 · Cuestionario" active={phase === "anamnesis"} done={tasks.anamnesis} />
        <div className="flex-1 h-px bg-white/20" />
        <PhasePill label="2 · Contrato" active={phase === "contract"} done={tasks.contract} />
      </div>

      {phase === "anamnesis" && (
        <AnamnesisWizard
          steps={steps}
          initial={initialAnamnesis}
          onDone={() => setTasks((t) => ({ ...t, anamnesis: true }))}
        />
      )}

      {phase === "contract" && (
        <ContractSign
          contractText={contractText}
          onDone={() => setTasks((t) => ({ ...t, contract: true }))}
        />
      )}

      {phase === "done" && <DoneScreen patientId={patientId} />}
    </div>
  );
}

function PhasePill({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <span
      className={`text-xs font-medium px-3 py-1.5 rounded-full border whitespace-nowrap ${
        done
          ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/40"
          : active
          ? "bg-amber-400/20 text-amber-200 border-amber-300/50"
          : "bg-white/5 text-neutral-400 border-white/15"
      }`}
    >
      {done ? "✓ " : ""}
      {label}
    </span>
  );
}

// ============================================================================
// Anamnesis — cuestionario por pasos
// ============================================================================

function AnamnesisWizard({
  steps,
  initial,
  onDone,
}: {
  steps: AnamnesisStep[];
  initial: Answers;
  onDone: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  function setValue(key: string, value: unknown) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setError("");
  }

  function missingInStep(): boolean {
    for (const f of step.fields) {
      if (!f.required) continue;
      const v = answers[f.key];
      if (f.type === "multiselect") {
        if (!Array.isArray(v) || v.length === 0) return true;
        continue;
      }
      if (v === undefined || v === null || String(v).trim() === "") return true;
    }
    return false;
  }

  async function next() {
    if (missingInStep()) {
      setError("Completa los campos obligatorios (marcados con *) para continuar.");
      return;
    }
    if (!isLast) {
      setStepIndex((i) => i + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // Último paso → enviar
    setSaving(true);
    setError("");
    const res = await fetch("/api/patient/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "anamnesis", data: answers }),
    });
    if (res.ok) {
      onDone();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "No se pudo guardar. Inténtalo de nuevo.");
      setSaving(false);
    }
  }

  function back() {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }

  return (
    <div>
      <div className="text-xs text-neutral-400 mb-2">
        Paso {stepIndex + 1} de {steps.length}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-1">{step.title}</h2>
        {step.description && <p className="text-sm text-neutral-500 mb-4">{step.description}</p>}

        <div className={step.layout === "grid-2" ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : "space-y-4"}>
          {step.fields.map((f) => (
            <FieldInput key={f.key} field={f} value={answers[f.key]} onChange={(v) => setValue(f.key, v)} />
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

      <div className="flex justify-between items-center gap-2 mt-5">
        <button
          onClick={back}
          disabled={stepIndex === 0 || saving}
          className="btn btn-ghost text-sm disabled:opacity-30"
        >
          ← Atrás
        </button>
        <button onClick={next} disabled={saving} className="btn btn-primary text-sm">
          {saving ? "Guardando..." : isLast ? "Finalizar cuestionario" : "Siguiente →"}
        </button>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: AnamnesisField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <label className="text-sm font-medium block mb-1.5">
      {field.label}
      {field.required && <span className="text-red-500"> *</span>}
    </label>
  );

  const strVal = value == null ? "" : String(value);

  return (
    <div>
      {label}
      {field.help && <p className="text-xs text-neutral-500 mb-1.5 -mt-1">{field.help}</p>}

      {field.type === "textarea" && (
        <textarea
          className="input text-sm"
          rows={3}
          value={strVal}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.type === "text" && (
        <input
          className="input text-sm"
          value={strVal}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.type === "number" && (
        <input
          type="number"
          className="input text-sm"
          value={strVal}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.type === "date" && (
        <input
          type="date"
          className="input text-sm"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.type === "select" && (
        <select className="input text-sm" value={strVal} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecciona...</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}

      {field.type === "radio" && (
        <div className="flex flex-wrap gap-2">
          {field.options?.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              className={`text-sm px-3 py-1.5 rounded-lg border transition ${
                strVal === o
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white border-neutral-300 text-neutral-700 hover:border-neutral-500"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}

      {field.type === "scale" && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`w-8 h-8 text-sm rounded-lg border transition ${
                String(value) === String(n)
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white border-neutral-300 text-neutral-700 hover:border-neutral-500"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {field.type === "multiselect" && (
        <div className="flex flex-wrap gap-2">
          {field.options?.map((o) => {
            const selected = Array.isArray(value) && (value as unknown[]).includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => {
                  const current = Array.isArray(value) ? [...(value as string[])] : [];
                  const idx = current.indexOf(o);
                  if (idx >= 0) current.splice(idx, 1);
                  else current.push(o);
                  onChange(current);
                }}
                className={`text-sm px-3 py-1.5 rounded-lg border transition ${
                  selected
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-white border-neutral-300 text-neutral-700 hover:border-neutral-500"
                }`}
              >
                {selected ? "✓ " : ""}{o}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Contrato — lectura + firma con DNI
// ============================================================================

function ContractSign({ contractText, onDone }: { contractText: string; onDone: () => void }) {
  const [dni, setDni] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSign = dni.trim().length > 0 && accepted && !saving;

  async function sign() {
    if (!canSign) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/patient/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "contract", dni: dni.trim(), accepted: true }),
    });
    if (res.ok) {
      onDone();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "No se pudo registrar la firma. Inténtalo de nuevo.");
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Contrato de servicios</h2>
        <div className="max-h-72 overflow-y-auto text-xs text-neutral-700 whitespace-pre-wrap border border-neutral-200 rounded-lg p-3 bg-neutral-50 leading-relaxed">
          {contractText}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1.5">
              DNI / NIE <span className="text-red-500">*</span>
            </label>
            <input
              className="input text-sm font-mono uppercase"
              value={dni}
              onChange={(e) => setDni(e.target.value.toUpperCase())}
              placeholder="12345678A"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-neutral-700 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="w-5 h-5 accent-neutral-900 flex-shrink-0 mt-0.5"
            />
            <span>He leído y acepto el contrato. Confirmo que los datos facilitados son veraces.</span>
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

      <div className="flex justify-end mt-5">
        <button onClick={sign} disabled={!canSign} className="btn btn-primary text-sm disabled:opacity-40">
          {saving ? "Firmando..." : "Firmar y continuar"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Pantalla final
// ============================================================================

function DoneScreen({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [going, setGoing] = useState(false);

  function enter() {
    setGoing(true);
    router.push(`/paciente/${patientId}`);
    router.refresh();
  }

  return (
    <div className="card text-center py-10">
      <div className="text-5xl mb-3">✅</div>
      <h2 className="text-lg font-semibold mb-1">¡Todo listo!</h2>
      <p className="text-sm text-neutral-500 max-w-sm mx-auto mb-6">
        Has completado el cuestionario y firmado el contrato. Tu fisio revisará tu información y preparará tu programa.
      </p>
      <button onClick={enter} disabled={going} className="btn btn-primary text-sm">
        {going ? "Entrando..." : "Entrar a mi programa"}
      </button>
    </div>
  );
}
