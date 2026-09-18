"use client";

import { useEffect, useState } from "react";

/**
 * Desplegable colapsado por defecto con el objetivo del trimestre del
 * CEO: temática principal + 4 focos por departamento (marketing, ventas,
 * servicio, ceo). Todos los campos son texto libre.
 *
 * Modo lectura para todos los que puedan ver la card; modo edición solo
 * para CEO (el server ya rechaza el PUT de cualquier otro rol).
 *
 * Va montado dentro de la tab "Tareas" del panel principal del CEO.
 */

type Objective = {
  quarter: string;
  mainTheme: string;
  focusMarketing: string;
  focusSales: string;
  focusService: string;
  focusCeo: string;
  updatedAt: string;
};

type FocusKey = "focusMarketing" | "focusSales" | "focusService" | "focusCeo";

const FOCUS_LABELS: Array<{ key: FocusKey; label: string; emoji: string }> = [
  { key: "focusMarketing", label: "Marketing", emoji: "📣" },
  { key: "focusSales", label: "Ventas", emoji: "🤝" },
  { key: "focusService", label: "Servicio", emoji: "🩺" },
  { key: "focusCeo", label: "CEO", emoji: "👑" },
];

function quarterHumanLabel(q: string): string {
  const m = q.match(/^(\d{4})-Q([1-4])$/);
  if (!m) return q;
  const year = m[1];
  const nq = Number(m[2]);
  const months: Record<number, string> = { 1: "ene-mar", 2: "abr-jun", 3: "jul-sep", 4: "oct-dic" };
  const ord = ["", "1er", "2º", "3er", "4º"][nq];
  return `${ord} trimestre ${year} · ${months[nq]}`;
}

export function QuarterlyObjectiveCard() {
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false); // colapsado por defecto
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quarter, setQuarter] = useState<string>("");
  const [objective, setObjective] = useState<Objective | null>(null);

  // Buffer editable — solo se materializa al guardar.
  const [draft, setDraft] = useState({
    mainTheme: "",
    focusMarketing: "",
    focusSales: "",
    focusService: "",
    focusCeo: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/quarterly-objective");
        if (!r.ok) {
          if (!cancelled) setError(r.status === 403 ? "" : `Error ${r.status}`);
          return;
        }
        const d = await r.json();
        if (cancelled) return;
        setQuarter(d.quarter);
        setObjective(d.objective);
        if (d.objective) {
          setDraft({
            mainTheme: d.objective.mainTheme ?? "",
            focusMarketing: d.objective.focusMarketing ?? "",
            focusSales: d.objective.focusSales ?? "",
            focusService: d.objective.focusService ?? "",
            focusCeo: d.objective.focusCeo ?? "",
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Error inesperado");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/quarterly-objective", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d?.error || `Error ${r.status}`);
        return;
      }
      setObjective(d.objective);
      setEditing(false);
    } catch (e: any) {
      setError(e?.message ?? "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (objective) {
      setDraft({
        mainTheme: objective.mainTheme ?? "",
        focusMarketing: objective.focusMarketing ?? "",
        focusSales: objective.focusSales ?? "",
        focusService: objective.focusService ?? "",
        focusCeo: objective.focusCeo ?? "",
      });
    } else {
      setDraft({ mainTheme: "", focusMarketing: "", focusSales: "", focusService: "", focusCeo: "" });
    }
    setEditing(false);
    setError(null);
  }

  const isDefined = !!objective && !!(objective.mainTheme || objective.focusMarketing || objective.focusSales || objective.focusService || objective.focusCeo);

  return (
    <section className="card mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-neutral-500 text-xs">{open ? "▼" : "▶"}</span>
          <h2 className="font-medium">🎯 Objetivo del trimestre</h2>
          {quarter && (
            <span className="text-xs text-neutral-500 capitalize">{quarterHumanLabel(quarter)}</span>
          )}
          {!open && !isDefined && !loading && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              Sin definir
            </span>
          )}
          {!open && isDefined && (
            <span className="text-[11px] text-neutral-600 italic ml-1 line-clamp-1 max-w-md">
              {objective!.mainTheme}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="mt-3">
          {loading ? (
            <p className="text-xs text-neutral-500 italic">Cargando…</p>
          ) : editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1">Temática principal</label>
                <textarea
                  value={draft.mainTheme}
                  onChange={(e) => setDraft((p) => ({ ...p, mainTheme: e.target.value }))}
                  className="w-full text-sm p-2 rounded-lg"
                  style={{ border: "1px solid #E5E5E5", minHeight: 60 }}
                  placeholder="Ej. 'Escalar sin romper el servicio: llegar a 250 pacientes activos manteniendo NPS >70'"
                />
              </div>
              {FOCUS_LABELS.map((f) => (
                <div key={f.key}>
                  <label className="text-xs font-medium block mb-1">
                    {f.emoji} {f.label}
                  </label>
                  <textarea
                    value={draft[f.key]}
                    onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full text-sm p-2 rounded-lg"
                    style={{ border: "1px solid #E5E5E5", minHeight: 70 }}
                    placeholder="Lo que este departamento debe empujar este trimestre."
                  />
                </div>
              ))}

              {error && <div className="text-xs text-red-600">{error}</div>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={cancel}
                  disabled={saving}
                  className="text-xs px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
                  style={{ background: "#0A0A0A", color: "#FAFAFA" }}
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!isDefined ? (
                <p className="text-sm text-neutral-500 italic">
                  Aún no has definido el objetivo del trimestre. Pulsa <b>Editar</b> para escribirlo.
                </p>
              ) : (
                <>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Temática principal</div>
                    <p className="text-sm text-neutral-900 whitespace-pre-wrap font-medium">
                      {objective!.mainTheme || <span className="italic text-neutral-400">Sin escribir</span>}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {FOCUS_LABELS.map((f) => (
                      <div key={f.key} className="rounded-lg p-3" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
                        <div className="text-xs font-semibold mb-1">
                          {f.emoji} {f.label}
                        </div>
                        <p className="text-xs text-neutral-700 whitespace-pre-wrap">
                          {objective![f.key] || <span className="italic text-neutral-400">Sin foco definido</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg"
                  style={{ background: "#0A0A0A", color: "#FAFAFA" }}
                >
                  {isDefined ? "✎ Editar" : "+ Definir"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
