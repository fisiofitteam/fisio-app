"use client";

import { useState } from "react";
import { Save, RotateCcw, TrendingUp, TrendingDown } from "lucide-react";

type Direction = "increase" | "decrease";
type Rule = { enabled: boolean; direction: Direction; thresholdPct: number; windowDays: number };
type Config = Record<string, Rule>;

export type MetricMeta = {
  key: string;
  label: string;
  emoji: string;
  hint: string;
  defaultDir: Direction;
};

/**
 * Editor generico de reglas de alerta por metrica. Recibe la lista de
 * metricas a mostrar (variable segun scope: global = ambas fuentes,
 * paciente ADVANCE = daily-log, paciente REHAB = biblioteca).
 */
export function MetricAlertsEditor({
  initial,
  initialOverride,
  scope,
  metrics,
  onSave,
  onReset,
}: {
  initial: Config;
  initialOverride?: boolean;
  scope: "template" | "patient";
  metrics: MetricMeta[];
  onSave: (config: Config) => Promise<Config | void>;
  onReset?: () => Promise<Config | void>;
}) {
  // Sembramos el shape inicial con TODAS las metricas del scope aunque el
  // config guardado no tenga entradas para todas — asi el fisio ve todos
  // los bloques disponibles con default OFF.
  const seed: Config = {};
  for (const m of metrics) {
    seed[m.key] = initial[m.key] ?? {
      enabled: false,
      direction: m.defaultDir,
      thresholdPct: 20,
      windowDays: 7,
    };
  }
  const [config, setConfig] = useState<Config>(seed);
  const [override, setOverride] = useState(!!initialOverride);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function patch(key: string, partial: Partial<Rule>) {
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], ...partial } }));
  }

  async function save() {
    setSaving(true);
    try {
      const result = await onSave(config);
      if (result) {
        // Rehidratamos manteniendo los defaults para keys que el server
        // pueda haber omitido (por no venir enabled).
        const next: Config = { ...config };
        for (const [k, v] of Object.entries(result)) next[k] = v as Rule;
        setConfig(next);
      }
      if (scope === "patient") setOverride(true);
      setFlash({ kind: "ok", text: "Cambios guardados" });
    } catch {
      setFlash({ kind: "err", text: "No se pudo guardar" });
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 3000);
    }
  }

  async function reset() {
    if (!onReset) return;
    setSaving(true);
    try {
      const result = await onReset();
      if (result) {
        const next: Config = {};
        for (const m of metrics) {
          next[m.key] = (result as Config)[m.key] ?? {
            enabled: false, direction: m.defaultDir, thresholdPct: 20, windowDays: 7,
          };
        }
        setConfig(next);
      }
      setOverride(false);
      setFlash({ kind: "ok", text: "Config personalizada eliminada; hereda plantilla" });
    } catch {
      setFlash({ kind: "err", text: "No se pudo resetear" });
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 3000);
    }
  }

  return (
    <div className="space-y-4">
      {scope === "patient" && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
          {override
            ? <><strong>Config personalizada</strong> para este paciente. Deja de heredar la plantilla global.</>
            : <>Heredando la <strong>plantilla global</strong>. Al guardar aqui, se creara un override para este paciente.</>}
        </div>
      )}

      {metrics.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
          No hay métricas configurables para este ámbito.
        </div>
      ) : (
        <div className="space-y-3">
          {metrics.map((m) => {
            const rule = config[m.key];
            if (!rule) return null;
            return (
              <div key={m.key} className={`rounded-xl border p-3 ${rule.enabled ? "bg-white border-neutral-200" : "bg-neutral-50 border-neutral-200"}`}>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => patch(m.key, { enabled: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-base">{m.emoji}</span>
                  <span className="font-semibold text-sm">{m.label}</span>
                  {m.hint && <span className="text-[11px] text-neutral-500 ml-auto">{m.hint}</span>}
                </label>

                <div className={`grid grid-cols-1 md:grid-cols-3 gap-2 pl-6 ${rule.enabled ? "" : "opacity-40 pointer-events-none"}`}>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 block mb-1">Direccion</label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => patch(m.key, { direction: "increase" })}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1 border ${rule.direction === "increase" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-700"}`}
                      >
                        <TrendingUp size={12} /> Subida
                      </button>
                      <button
                        type="button"
                        onClick={() => patch(m.key, { direction: "decrease" })}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1 border ${rule.direction === "decrease" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-700"}`}
                      >
                        <TrendingDown size={12} /> Bajada
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 block mb-1">
                      Umbral (% vs media)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={rule.thresholdPct}
                        onChange={(e) => patch(m.key, { thresholdPct: Number(e.target.value) })}
                        className="w-full text-sm bg-white border border-neutral-300 rounded-lg px-2 py-1.5"
                      />
                      <span className="text-xs text-neutral-500">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 block mb-1">
                      Ventana (dias)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={rule.windowDays}
                        onChange={(e) => patch(m.key, { windowDays: Number(e.target.value) })}
                        className="w-full text-sm bg-white border border-neutral-300 rounded-lg px-2 py-1.5"
                      />
                      <span className="text-xs text-neutral-500">d</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 justify-end flex-wrap">
        {flash && (
          <span className={`text-xs px-2 py-1 rounded ${flash.kind === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {flash.text}
          </span>
        )}
        {scope === "patient" && override && (
          <button
            onClick={reset}
            disabled={saving}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw size={12} /> Volver a la plantilla
          </button>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 flex items-center gap-1.5 disabled:opacity-50"
        >
          <Save size={12} /> {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
