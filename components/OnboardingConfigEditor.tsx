"use client";

import { useState } from "react";
import type {
  AnamnesisField,
  AnamnesisFieldType,
  AnamnesisStep,
} from "@/lib/onboarding-content";

const TYPE_OPTIONS: { value: AnamnesisFieldType; label: string }[] = [
  { value: "text", label: "Texto corto" },
  { value: "textarea", label: "Texto largo" },
  { value: "number", label: "Número" },
  { value: "radio", label: "Opción única (botones)" },
  { value: "select", label: "Desplegable" },
  { value: "scale", label: "Escala 0-10" },
  { value: "date", label: "Fecha" },
];

function newKey() {
  return "k_" + Math.random().toString(36).slice(2, 9);
}

export function OnboardingConfigEditor({
  initialSteps,
  initialContractText,
  initialContractVersion,
}: {
  initialSteps: AnamnesisStep[];
  initialContractText: string;
  initialContractVersion: string;
}) {
  const [tab, setTab] = useState<"cuestionario" | "contrato">("cuestionario");
  const [steps, setSteps] = useState<AnamnesisStep[]>(initialSteps);
  const [contractText, setContractText] = useState(initialContractText);
  const [contractVersion, setContractVersion] = useState(initialContractVersion);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // ---- helpers de mutación inmutable ----
  function setStep(si: number, patch: Partial<AnamnesisStep>) {
    setSteps((prev) => prev.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  }
  function moveStep(si: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const j = si + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[si], next[j]] = [next[j], next[si]];
      return next;
    });
  }
  function removeStep(si: number) {
    if (!confirm("¿Eliminar este paso y todas sus preguntas?")) return;
    setSteps((prev) => prev.filter((_, i) => i !== si));
  }
  function addStep() {
    setSteps((prev) => [
      ...prev,
      { id: "step_" + newKey(), title: "Nuevo paso", description: "", fields: [] },
    ]);
  }

  function setField(si: number, fi: number, patch: Partial<AnamnesisField>) {
    setSteps((prev) =>
      prev.map((s, i) =>
        i === si ? { ...s, fields: s.fields.map((f, k) => (k === fi ? { ...f, ...patch } : f)) } : s
      )
    );
  }
  function moveField(si: number, fi: number, dir: -1 | 1) {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== si) return s;
        const fields = [...s.fields];
        const j = fi + dir;
        if (j < 0 || j >= fields.length) return s;
        [fields[fi], fields[j]] = [fields[j], fields[fi]];
        return { ...s, fields };
      })
    );
  }
  function removeField(si: number, fi: number) {
    setSteps((prev) =>
      prev.map((s, i) => (i === si ? { ...s, fields: s.fields.filter((_, k) => k !== fi) } : s))
    );
  }
  function addField(si: number) {
    setSteps((prev) =>
      prev.map((s, i) =>
        i === si
          ? { ...s, fields: [...s.fields, { key: newKey(), label: "", type: "text" as AnamnesisFieldType }] }
          : s
      )
    );
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/onboarding-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anamnesisSteps: steps, contractText, contractVersion }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // refrescar con la versión saneada del servidor
        setSteps(data.anamnesisSteps ?? steps);
        setContractText(data.contractText ?? contractText);
        setContractVersion(data.contractVersion ?? contractVersion);
        setMsg({ kind: "ok", text: "Guardado. Los nuevos pacientes verán estos cambios." });
      } else {
        setMsg({ kind: "err", text: data.error || "No se pudo guardar." });
      }
    } catch {
      setMsg({ kind: "err", text: "Error de red al guardar." });
    }
    setSaving(false);
  }

  return (
    <div>
      <div className="flex justify-between items-start gap-3 flex-wrap mb-4">
        <div>
          <h2 className="font-semibold text-lg">Onboarding del paciente</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Edita el cuestionario inicial y el contrato. Afecta a los pacientes que aún no lo han completado.
          </p>
        </div>
        <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {msg && (
        <div
          className={`text-sm rounded-lg px-3 py-2 mb-4 ${
            msg.kind === "ok" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-neutral-200">
        <button
          onClick={() => setTab("cuestionario")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            tab === "cuestionario" ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500"
          }`}
        >
          📝 Cuestionario
        </button>
        <button
          onClick={() => setTab("contrato")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            tab === "contrato" ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500"
          }`}
        >
          📄 Contrato
        </button>
      </div>

      {tab === "cuestionario" ? (
        <div className="space-y-4">
          {steps.map((step, si) => (
            <StepCard
              key={step.id}
              step={step}
              index={si}
              total={steps.length}
              onChange={(patch) => setStep(si, patch)}
              onMove={(dir) => moveStep(si, dir)}
              onRemove={() => removeStep(si)}
              onFieldChange={(fi, patch) => setField(si, fi, patch)}
              onFieldMove={(fi, dir) => moveField(si, fi, dir)}
              onFieldRemove={(fi) => removeField(si, fi)}
              onAddField={() => addField(si)}
            />
          ))}
          <button onClick={addStep} className="btn text-sm w-full">
            + Añadir paso
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="card">
            <label className="text-xs text-neutral-500 block mb-1">Versión del contrato</label>
            <input
              className="input text-sm max-w-[160px] font-mono"
              value={contractVersion}
              onChange={(e) => setContractVersion(e.target.value)}
              placeholder="v1"
            />
            <p className="text-xs text-neutral-400 mt-1">
              Súbela (v2, v3...) cuando cambies el contrato de forma sustancial. Las firmas ya hechas conservan el texto firmado.
            </p>
          </div>
          <div className="card">
            <label className="text-xs text-neutral-500 block mb-1">Texto del contrato</label>
            <textarea
              className="input text-sm font-mono leading-relaxed"
              rows={22}
              value={contractText}
              onChange={(e) => setContractText(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tarjeta de un paso
// ============================================================================

function StepCard({
  step,
  index,
  total,
  onChange,
  onMove,
  onRemove,
  onFieldChange,
  onFieldMove,
  onFieldRemove,
  onAddField,
}: {
  step: AnamnesisStep;
  index: number;
  total: number;
  onChange: (patch: Partial<AnamnesisStep>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onFieldChange: (fi: number, patch: Partial<AnamnesisField>) => void;
  onFieldMove: (fi: number, dir: -1 | 1) => void;
  onFieldRemove: (fi: number) => void;
  onAddField: () => void;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">Paso {index + 1}</span>
        <div className="flex items-center gap-1">
          <IconBtn label="Subir" disabled={index === 0} onClick={() => onMove(-1)}>↑</IconBtn>
          <IconBtn label="Bajar" disabled={index === total - 1} onClick={() => onMove(1)}>↓</IconBtn>
          <IconBtn label="Eliminar paso" danger onClick={onRemove}>✕</IconBtn>
        </div>
      </div>

      <input
        className="input text-sm font-medium mb-2"
        value={step.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="Título del paso"
      />
      <input
        className="input text-sm mb-3"
        value={step.description ?? ""}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Descripción (opcional)"
      />

      <div className="space-y-2">
        {step.fields.map((f, fi) => (
          <FieldRow
            key={f.key}
            field={f}
            index={fi}
            total={step.fields.length}
            onChange={(patch) => onFieldChange(fi, patch)}
            onMove={(dir) => onFieldMove(fi, dir)}
            onRemove={() => onFieldRemove(fi)}
          />
        ))}
      </div>

      <button onClick={onAddField} className="mt-3 text-sm text-blue-600 hover:underline">
        + Añadir pregunta
      </button>
    </div>
  );
}

// ============================================================================
// Fila de una pregunta
// ============================================================================

function FieldRow({
  field,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  field: AnamnesisField;
  index: number;
  total: number;
  onChange: (patch: Partial<AnamnesisField>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const hasOptions = field.type === "select" || field.type === "radio";

  return (
    <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50">
      <div className="flex items-start gap-2">
        <input
          className="input text-sm flex-1"
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Texto de la pregunta"
        />
        <div className="flex items-center gap-1 flex-shrink-0">
          <IconBtn label="Subir" disabled={index === 0} onClick={() => onMove(-1)}>↑</IconBtn>
          <IconBtn label="Bajar" disabled={index === total - 1} onClick={() => onMove(1)}>↓</IconBtn>
          <IconBtn label="Eliminar pregunta" danger onClick={onRemove}>✕</IconBtn>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-2">
        <select
          className="input text-sm max-w-[210px]"
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value as AnamnesisFieldType })}
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={Boolean(field.required)}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="w-4 h-4 accent-neutral-900"
          />
          Obligatoria
        </label>
      </div>

      <input
        className="input text-sm mt-2"
        value={field.placeholder ?? ""}
        onChange={(e) => onChange({ placeholder: e.target.value })}
        placeholder="Texto de ayuda dentro del campo (opcional)"
      />

      {hasOptions && (
        <div className="mt-2">
          <label className="text-xs text-neutral-500 block mb-1">Opciones (una por línea)</label>
          <textarea
            className="input text-sm"
            rows={3}
            value={(field.options ?? []).join("\n")}
            onChange={(e) =>
              onChange({ options: e.target.value.split("\n").map((o) => o).filter((o) => o.trim() !== "") })
            }
            placeholder={"Opción 1\nOpción 2"}
          />
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  danger,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-7 h-7 rounded border text-sm flex items-center justify-center disabled:opacity-30 ${
        danger
          ? "border-neutral-200 text-neutral-400 hover:text-red-600 hover:border-red-300"
          : "border-neutral-200 text-neutral-500 hover:bg-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}
