"use client";

import { useState } from "react";
import {
  pickWelcomeMessage,
  type WelcomeConfig,
  type WelcomeRule,
} from "@/lib/welcome-content";
import { applyVars } from "@/lib/landing-content";

const PROGRAM_OPTIONS: { value: WelcomeRule["programType"]; label: string }[] = [
  { value: "any", label: "Cualquier programa" },
  { value: "RECUPERA", label: "RECUPERA" },
  { value: "CONSOLIDA", label: "CONSOLIDA" },
  { value: "ADVANCE", label: "ADVANCE" },
];

export function WelcomeMessageEditor({ initial }: { initial: WelcomeConfig }) {
  const [config, setConfig] = useState<WelcomeConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Simulador de vista previa
  const [simProgram, setSimProgram] = useState<string>("CONSOLIDA");
  const [simWeeks, setSimWeeks] = useState(2);

  function setRule(i: number, patch: Partial<WelcomeRule>) {
    setConfig((c) => ({ ...c, rules: c.rules.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  }
  function moveRule(i: number, dir: -1 | 1) {
    setConfig((c) => {
      const next = [...c.rules];
      const j = i + dir;
      if (j < 0 || j >= next.length) return c;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...c, rules: next };
    });
  }
  function removeRule(i: number) {
    setConfig((c) => ({ ...c, rules: c.rules.filter((_, k) => k !== i) }));
  }
  function addRule() {
    setConfig((c) => ({
      ...c,
      rules: [...c.rules, { programType: "any", minWeeks: null, maxWeeks: null, line1: "", line2: "" }],
    }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/welcome-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setConfig({ rules: data.rules ?? config.rules, fallbackLine1: data.fallbackLine1, fallbackLine2: data.fallbackLine2 });
        setMsg({ kind: "ok", text: "Guardado. La home del paciente ya usa estos mensajes." });
      } else {
        setMsg({ kind: "err", text: data.error || "No se pudo guardar." });
      }
    } catch {
      setMsg({ kind: "err", text: "Error de red al guardar." });
    }
    setSaving(false);
  }

  // Vista previa: qué mensaje saldría con los datos del simulador
  const picked = pickWelcomeMessage(config, { programType: simProgram, weeksInProgram: simWeeks });
  const vars = {
    nombre: "Marta",
    semanas: String(simWeeks),
    meses: String(Math.floor((simWeeks * 7) / 30)),
    programa: simProgram,
  };
  const v = (t: string) => applyVars(t, vars);

  function weeksFieldVal(n: number | null) {
    return n == null ? "" : String(n);
  }
  function parseWeeks(s: string): number | null {
    if (s.trim() === "") return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  return (
    <div>
      <div className="flex justify-between items-start gap-3 flex-wrap mb-4">
        <div>
          <h2 className="font-semibold text-lg">Mensaje de bienvenida</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            El saludo grande de la home del paciente. Se elige la <strong>primera regla que encaje</strong>; si ninguna aplica, se usa el mensaje por defecto.
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

      <p className="text-[11px] text-neutral-500 bg-neutral-50 border border-neutral-200 rounded p-2 mb-4">
        Variables disponibles: <code>{"{nombre}"}</code> <code>{"{semanas}"}</code> <code>{"{meses}"}</code> <code>{"{programa}"}</code>. La 2ª línea se muestra con el degradado de marca.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Editor */}
        <div className="space-y-3">
          {/* Reglas */}
          {config.rules.map((r, i) => (
            <div key={i} className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">Regla {i + 1}</span>
                <div className="flex items-center gap-1">
                  <IconBtn label="Subir" disabled={i === 0} onClick={() => moveRule(i, -1)}>↑</IconBtn>
                  <IconBtn label="Bajar" disabled={i === config.rules.length - 1} onClick={() => moveRule(i, 1)}>↓</IconBtn>
                  <IconBtn label="Eliminar" danger onClick={() => removeRule(i)}>✕</IconBtn>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="col-span-3 sm:col-span-1">
                  <label className="text-[11px] text-neutral-500 block mb-1">Programa</label>
                  <select className="input text-sm" value={r.programType} onChange={(e) => setRule(i, { programType: e.target.value as WelcomeRule["programType"] })}>
                    {PROGRAM_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-neutral-500 block mb-1">Desde (semana)</label>
                  <input type="number" min="0" className="input text-sm" value={weeksFieldVal(r.minWeeks)} onChange={(e) => setRule(i, { minWeeks: parseWeeks(e.target.value) })} placeholder="0" />
                </div>
                <div>
                  <label className="text-[11px] text-neutral-500 block mb-1">Hasta (semana)</label>
                  <input type="number" min="0" className="input text-sm" value={weeksFieldVal(r.maxWeeks)} onChange={(e) => setRule(i, { maxWeeks: parseWeeks(e.target.value) })} placeholder="∞" />
                </div>
              </div>

              <input className="input text-sm mb-2" value={r.line1} onChange={(e) => setRule(i, { line1: e.target.value })} placeholder="Primera línea" />
              <input className="input text-sm" value={r.line2} onChange={(e) => setRule(i, { line2: e.target.value })} placeholder="Segunda línea (degradado)" />
            </div>
          ))}

          <button onClick={addRule} className="btn text-sm w-full">+ Añadir regla</button>

          {/* Fallback */}
          <div className="card border-dashed">
            <div className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium mb-2">Mensaje por defecto (si ninguna regla encaja)</div>
            <input className="input text-sm mb-2" value={config.fallbackLine1} onChange={(e) => setConfig((c) => ({ ...c, fallbackLine1: e.target.value }))} placeholder="Primera línea" />
            <input className="input text-sm" value={config.fallbackLine2} onChange={(e) => setConfig((c) => ({ ...c, fallbackLine2: e.target.value }))} placeholder="Segunda línea (degradado)" />
          </div>
        </div>

        {/* Vista previa / simulador */}
        <div className="lg:sticky lg:top-4 self-start space-y-3">
          <div className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">Simulador</div>
          <div className="card">
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">Programa de prueba</label>
                <select className="input text-sm" value={simProgram} onChange={(e) => setSimProgram(e.target.value)}>
                  <option value="RECUPERA">RECUPERA</option>
                  <option value="CONSOLIDA">CONSOLIDA</option>
                  <option value="ADVANCE">ADVANCE</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-neutral-500 block mb-1">Semanas en programa</label>
                <input type="number" min="0" className="input text-sm" value={simWeeks} onChange={(e) => setSimWeeks(Math.max(0, Number(e.target.value) || 0))} />
              </div>
            </div>

            {/* Render con branding de la home del paciente */}
            <div className="rounded-xl p-5" style={{ background: "#0A0A0A" }}>
              <h1 className="font-bold" style={{ fontSize: 26, lineHeight: 1.05, letterSpacing: "-0.035em", color: "#FAFAFA" }}>
                {v(picked.line1)}<br />
                <span className="brand-gradient-text">{v(picked.line2)}</span>
              </h1>
            </div>
            <p className="text-[11px] text-neutral-400 mt-2">Así se ve con esos datos de ejemplo.</p>
          </div>
        </div>
      </div>
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
      className={`w-7 h-7 rounded border text-sm flex items-center justify-center flex-shrink-0 disabled:opacity-30 ${
        danger ? "border-neutral-200 text-neutral-400 hover:text-red-600 hover:border-red-300" : "border-neutral-200 text-neutral-500 hover:bg-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}
