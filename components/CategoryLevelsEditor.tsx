"use client";
/**
 * Editor de niveles por categoría.
 *
 * Estructura jerárquica: Categoría → Niveles → Reglas por movimiento.
 *
 * - Por cada categoría, lista de niveles + botón "+ Nivel".
 * - Por cada nivel, lista de movimientos de esa categoría. Para cada uno:
 *   selector state, inputs de carga / sustitución / warning. Cambios se
 *   guardan al perder foco (debounce 600ms).
 */
import { useEffect, useRef, useState } from "react";

type Movement = { id: string; displayName: string };
type Rule = {
  movementId: string;
  state: "OK" | "CONDITIONAL" | "BLOCKED";
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

export function CategoryLevelsEditor({ initial }: { initial: Category[] }) {
  const [cats, setCats] = useState<Category[]>(initial);

  async function addLevel(catId: string) {
    const name = prompt("Nombre del nivel (ej: 'Nivel 1 - Fase aguda')");
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
    if (!confirm("¿Borrar el nivel y todas sus reglas? Pacientes que lo tengan asignado se quedarán sin nivel.")) return;
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
  const [rules, setRules] = useState<Rule[]>(level.rules);
  const [open, setOpen] = useState(false);
  useEffect(() => { setRules(level.rules); }, [level.rules]);

  function ruleFor(movementId: string): Rule {
    return rules.find((r) => r.movementId === movementId) ?? {
      movementId, state: "OK", loadConstraint: null, substitutionText: null, physioWarning: null,
    };
  }

  function updateLocal(next: Rule) {
    setRules((arr) => {
      const others = arr.filter((r) => r.movementId !== next.movementId);
      // Si todo el state queda como OK + sin texto, lo consideramos "sin restricción" y lo eliminamos.
      const empty = next.state === "OK" && !next.loadConstraint && !next.substitutionText && !next.physioWarning;
      const out = empty ? others : [...others, next];
      onRulesChange(out);
      return out;
    });
  }

  return (
    <div className="border border-neutral-200 rounded-lg p-2">
      <div className="flex justify-between items-center">
        <button onClick={() => setOpen((v) => !v)} className="text-sm font-medium text-left">
          <span className="mr-2">{open ? "▼" : "▶"}</span>
          🪜 {level.name}
          <span className="text-[10px] text-neutral-400 font-normal ml-2">({rules.length} reglas)</span>
        </button>
        <div className="flex gap-2">
          <button onClick={onRename} className="text-[11px] text-neutral-500 hover:text-neutral-900">Renombrar</button>
          <button onClick={onDelete} className="text-[11px] text-red-700 hover:underline">Borrar</button>
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-1.5">
          {category.movements.map((m) => (
            <RuleRow key={m.id} movement={m} initial={ruleFor(m.id)} categoryLevelId={level.id} onSaved={updateLocal} />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleRow({
  movement, initial, categoryLevelId, onSaved,
}: {
  movement: Movement;
  initial: Rule;
  categoryLevelId: string;
  onSaved: (rule: Rule) => void;
}) {
  const [state, setState] = useState<Rule["state"]>(initial.state);
  const [load, setLoad] = useState(initial.loadConstraint ?? "");
  const [subst, setSubst] = useState(initial.substitutionText ?? "");
  const [warn, setWarn] = useState(initial.physioWarning ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 600);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function save() {
    const empty = state === "OK" && !load.trim() && !subst.trim() && !warn.trim();
    if (empty) {
      await fetch(`/api/category-levels/rules?categoryLevelId=${categoryLevelId}&movementId=${movement.id}`, { method: "DELETE" });
      onSaved({ movementId: movement.id, state: "OK", loadConstraint: null, substitutionText: null, physioWarning: null });
      return;
    }
    const payload = {
      categoryLevelId, movementId: movement.id,
      state, loadConstraint: load.trim() || null, substitutionText: subst.trim() || null, physioWarning: warn.trim() || null,
    };
    const r = await fetch("/api/category-levels/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) onSaved({ movementId: movement.id, state, loadConstraint: load.trim() || null, substitutionText: subst.trim() || null, physioWarning: warn.trim() || null });
  }

  const stateColor = state === "OK" ? "bg-emerald-100 text-emerald-800" : state === "CONDITIONAL" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";

  return (
    <div className="border border-neutral-100 rounded p-2 bg-neutral-50/40 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium flex-1 min-w-0 truncate">{movement.displayName}</span>
        <select
          value={state}
          onChange={(e) => { setState(e.target.value as Rule["state"]); schedule(); }}
          className={`text-[11px] px-2 py-0.5 rounded ${stateColor} border-0 outline-none`}
        >
          <option value="OK">OK</option>
          <option value="CONDITIONAL">CONDICIONAL</option>
          <option value="BLOCKED">BLOQUEADO</option>
        </select>
      </div>
      {state !== "OK" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 pl-1">
          <input
            className="input text-[11px]"
            placeholder="Carga máx (ej: 60kg)"
            value={load}
            onChange={(e) => { setLoad(e.target.value); schedule(); }}
            onBlur={save}
          />
          <input
            className="input text-[11px]"
            placeholder="Sustitución"
            value={subst}
            onChange={(e) => { setSubst(e.target.value); schedule(); }}
            onBlur={save}
          />
          <input
            className="input text-[11px]"
            placeholder="Warning"
            value={warn}
            onChange={(e) => { setWarn(e.target.value); schedule(); }}
            onBlur={save}
          />
        </div>
      )}
    </div>
  );
}
