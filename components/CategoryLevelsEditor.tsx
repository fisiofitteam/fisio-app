"use client";
/**
 * Editor de Controles de Cargas (niveles por categoría).
 *
 * Misma vista que el AdaptationEditor del paciente: categoría como sección,
 * niveles colapsables dentro, resumen Total/OK/Cond/Bloq, lista de movimientos
 * como tarjetas y edición inline con pills + sustituto + carga + warning.
 */
import { useMemo, useState } from "react";

type Movement = { id: string; displayName: string };
type State = "OK" | "CONDITIONAL" | "BLOCKED";
type Rule = {
  movementId: string;
  state: State;
  loadConstraint: string | null;
  substitutionText: string | null;
  physioWarning: string | null;
};
type Level = {
  id: string;
  name: string;
  order: number;
  description: string | null;
  rules: Rule[];
};
type Category = {
  id: string;
  name: string;
  movements: Movement[];
  levels: Level[];
};

const DEFAULT_RULE = (movementId: string): Rule => ({
  movementId,
  state: "OK",
  loadConstraint: null,
  substitutionText: null,
  physioWarning: null,
});

export function CategoryLevelsEditor({ initial }: { initial: Category[] }) {
  const [cats, setCats] = useState<Category[]>(initial);

  async function addLevel(catId: string) {
    const name = prompt("Nombre del nivel (ej: 'Nivel 1 — Fase aguda')");
    if (!name?.trim()) return;
    const r = await fetch("/api/category-levels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: catId, name: name.trim() }),
    });
    const d = await r.json();
    if (!r.ok) { alert(d?.error ?? "Error"); return; }
    setCats((arr) => arr.map((c) => c.id === catId
      ? { ...c, levels: [...c.levels, { id: d.level.id, name: d.level.name, order: d.level.order, description: null, rules: [] }] }
      : c));
  }

  async function renameLevel(catId: string, levelId: string, current: string) {
    const name = prompt("Nuevo nombre del nivel", current);
    if (!name?.trim() || name.trim() === current) return;
    const r = await fetch("/api/category-levels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: levelId, name: name.trim() }),
    });
    if (!r.ok) return;
    setCats((arr) => arr.map((c) => c.id === catId
      ? { ...c, levels: c.levels.map((l) => l.id === levelId ? { ...l, name: name.trim() } : l) }
      : c));
  }

  async function deleteLevel(catId: string, levelId: string) {
    if (!confirm("¿Borrar el nivel y todas sus reglas? Pacientes asignados perderán este nivel.")) return;
    await fetch(`/api/category-levels?id=${levelId}`, { method: "DELETE" });
    setCats((arr) => arr.map((c) => c.id === catId ? { ...c, levels: c.levels.filter((l) => l.id !== levelId) } : c));
  }

  return (
    <div className="space-y-6">
      {cats.length === 0 && (
        <p className="text-xs text-neutral-500 italic">No hay categorías. Crea movimientos en el Catálogo para que aparezcan sus categorías.</p>
      )}
      {cats.map((c) => (
        <section key={c.id} className="card">
          <div className="flex justify-between items-baseline mb-2">
            <h3 className="text-sm font-semibold">📦 {c.name} <span className="text-[10px] text-neutral-400 font-normal">({c.movements.length} movimientos)</span></h3>
            <button onClick={() => addLevel(c.id)} className="btn btn-primary text-xs">+ Nivel</button>
          </div>
          {c.levels.length === 0 ? (
            <p className="text-xs text-neutral-400 italic">Sin niveles aún. Pulsa "+ Nivel" para añadir el primero.</p>
          ) : (
            <div className="space-y-3">
              {c.levels.map((l) => (
                <LevelBlock
                  key={l.id}
                  category={c}
                  level={l}
                  onRename={() => renameLevel(c.id, l.id, l.name)}
                  onDelete={() => deleteLevel(c.id, l.id)}
                  onRulesChange={(newRules) => {
                    setCats((arr) => arr.map((cc) => cc.id === c.id
                      ? { ...cc, levels: cc.levels.map((ll) => ll.id === l.id ? { ...ll, rules: newRules } : ll) }
                      : cc));
                  }}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function LevelBlock({
  category, level, onRename, onDelete, onRulesChange,
}: {
  category: Category;
  level: Level;
  onRename: () => void;
  onDelete: () => void;
  onRulesChange: (next: Rule[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingMov, setEditingMov] = useState<string | null>(null);

  const rulesById = useMemo(() => {
    const m = new Map<string, Rule>();
    for (const r of level.rules) m.set(r.movementId, r);
    return m;
  }, [level.rules]);

  function getDisplay(mov: Movement): Rule {
    return rulesById.get(mov.id) ?? DEFAULT_RULE(mov.id);
  }

  const stats = useMemo(() => {
    let ok = 0, cond = 0, blocked = 0;
    for (const mov of category.movements) {
      const r = getDisplay(mov);
      if (r.state === "BLOCKED") blocked++;
      else if (r.state === "CONDITIONAL") cond++;
      else ok++;
    }
    return { total: category.movements.length, ok, cond, blocked };
  }, [category.movements, rulesById]);

  async function saveRule(mov: Movement, item: Rule) {
    const empty = item.state === "OK" && !item.loadConstraint && !item.substitutionText && !item.physioWarning;
    if (empty) {
      await fetch(`/api/category-levels/rules?categoryLevelId=${level.id}&movementId=${mov.id}`, { method: "DELETE" });
      const next = level.rules.filter((r) => r.movementId !== mov.id);
      onRulesChange(next);
    } else {
      await fetch("/api/category-levels/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryLevelId: level.id, movementId: mov.id,
          state: item.state,
          loadConstraint: item.loadConstraint || null,
          substitutionText: item.substitutionText || null,
          physioWarning: item.physioWarning || null,
        }),
      });
      const others = level.rules.filter((r) => r.movementId !== mov.id);
      onRulesChange([...others, item]);
    }
    setEditingMov(null);
  }

  async function resetToOk(mov: Movement) {
    await fetch(`/api/category-levels/rules?categoryLevelId=${level.id}&movementId=${mov.id}`, { method: "DELETE" });
    onRulesChange(level.rules.filter((r) => r.movementId !== mov.id));
    setEditingMov(null);
  }

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden">
      <div className="flex justify-between items-center bg-neutral-50">
        <button onClick={() => setOpen((v) => !v)} className="flex-1 text-left px-3 py-2 flex items-center gap-2 hover:bg-neutral-100">
          <span className="text-neutral-400">{open ? "▾" : "▸"}</span>
          <span className="text-sm font-medium">🪜 {level.name}</span>
          <span className="text-[10px] text-neutral-400 font-normal ml-1">({level.rules.length} reglas)</span>
        </button>
        <div className="flex gap-1 pr-2">
          <button onClick={onRename} className="text-[11px] text-neutral-500 hover:text-neutral-900 px-2">Renombrar</button>
          <button onClick={onDelete} className="text-[11px] text-red-700 hover:underline px-2">Borrar</button>
        </div>
      </div>

      {open && (
        <div className="p-3 bg-white space-y-3">
          {/* Resumen igual que en el editor del paciente */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-neutral-100 p-2 rounded">
              <div className="text-base font-semibold">{stats.total}</div>
              <div className="text-[10px] text-neutral-500">Total</div>
            </div>
            <div className="bg-emerald-50 p-2 rounded">
              <div className="text-base font-semibold text-emerald-800">{stats.ok}</div>
              <div className="text-[10px] text-emerald-700">OK</div>
            </div>
            <div className="bg-amber-50 p-2 rounded">
              <div className="text-base font-semibold text-amber-800">{stats.cond}</div>
              <div className="text-[10px] text-amber-700">Cond.</div>
            </div>
            <div className="bg-red-50 p-2 rounded">
              <div className="text-base font-semibold text-red-800">{stats.blocked}</div>
              <div className="text-[10px] text-red-700">Bloq.</div>
            </div>
          </div>

          <div className="border border-neutral-200 rounded">
            {category.movements.map((mov) => {
              const a = getDisplay(mov);
              const isEditing = editingMov === mov.id;
              return (
                <div
                  key={mov.id}
                  className={`border-b border-neutral-100 last:border-0 ${
                    a.state === "BLOCKED" ? "bg-red-50"
                    : a.state === "CONDITIONAL" ? "bg-amber-50"
                    : ""
                  }`}
                >
                  {!isEditing ? (
                    <button
                      onClick={() => setEditingMov(mov.id)}
                      className="w-full text-left px-3 py-2 hover:bg-neutral-100"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{mov.displayName}</div>
                          {(a.substitutionText || a.loadConstraint) && (
                            <div className="text-xs text-neutral-600 mt-0.5 truncate">
                              {a.substitutionText && <span className="text-red-700">→ {a.substitutionText}</span>}
                              {a.loadConstraint && <span className="text-neutral-500"> · {a.loadConstraint}</span>}
                            </div>
                          )}
                          {a.physioWarning && (
                            <div className="text-xs italic text-amber-800 mt-0.5">⚠ {a.physioWarning}</div>
                          )}
                        </div>
                        <StatePill state={a.state} />
                      </div>
                    </button>
                  ) : (
                    <InlineRuleEditor
                      mov={mov}
                      current={a}
                      onSave={(item) => saveRule(mov, item)}
                      onCancel={() => setEditingMov(null)}
                      onReset={() => resetToOk(mov)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatePill({ state }: { state: State }) {
  if (state === "OK") return <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-800">OK</span>;
  if (state === "CONDITIONAL") return <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-amber-100 text-amber-800">Cond.</span>;
  return <span className="text-[10px] uppercase rounded px-1.5 py-0.5 bg-red-100 text-red-800">Bloq.</span>;
}

function InlineRuleEditor({
  mov, current, onSave, onCancel, onReset,
}: {
  mov: Movement;
  current: Rule;
  onSave: (item: Rule) => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const [state, setState] = useState<State>(current.state);
  const [sub, setSub] = useState(current.substitutionText ?? "");
  const [load, setLoad] = useState(current.loadConstraint ?? "");
  const [warn, setWarn] = useState(current.physioWarning ?? "");

  return (
    <div className="px-3 py-2 bg-white border-l-4 border-neutral-900">
      <div className="flex justify-between items-center mb-2">
        <div className="font-medium text-sm">{mov.displayName}</div>
        <button onClick={onCancel} className="text-xs text-neutral-400">✕ Cerrar</button>
      </div>
      <div className="space-y-2">
        <div className="flex gap-1">
          {(["OK", "CONDITIONAL", "BLOCKED"] as State[]).map((s) => (
            <button
              key={s}
              onClick={() => setState(s)}
              className={`flex-1 py-1.5 text-xs rounded ${state === s ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}
            >
              {s === "OK" ? "OK" : s === "CONDITIONAL" ? "Cond." : "Bloq."}
            </button>
          ))}
        </div>
        <input
          className="input text-sm"
          placeholder="Sustituto (ej: Ring row inclinado)"
          value={sub}
          onChange={(e) => setSub(e.target.value)}
        />
        <input
          className="input text-sm"
          placeholder="Carga máx (ej: 16 kg, 60% 1RM, BW)"
          value={load}
          onChange={(e) => setLoad(e.target.value)}
        />
        <input
          className="input text-sm"
          placeholder="Aviso al paciente (ej: si dolor > 5, parar)"
          value={warn}
          onChange={(e) => setWarn(e.target.value)}
        />
        <div className="flex justify-between gap-2 pt-1">
          <button onClick={onReset} className="text-xs text-neutral-500 underline">Volver a default (OK)</button>
          <button
            onClick={() => onSave({
              movementId: mov.id,
              state,
              loadConstraint: load.trim() || null,
              substitutionText: sub.trim() || null,
              physioWarning: warn.trim() || null,
            })}
            className="btn btn-primary text-xs"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
