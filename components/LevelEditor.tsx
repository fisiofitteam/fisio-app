"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

type State = "OK" | "CONDITIONAL" | "BLOCKED";

type Rule = {
  movementId: string;
  state: State;
  substitutionText: string;
  loadConstraint: string;
  physioWarning: string;
};

type Level = {
  id: string;
  name: string;
  order: number;
  description: string;
  rules: Rule[];
  rulesCount: number;
  patientsCount: number;
};

type Movement = { id: string; displayName: string; categoryId: string; categoryName: string };
type Category = { id: string; name: string };

export function LevelEditor({
  profileId,
  levels,
  movements,
  categories,
}: {
  profileId: string;
  levels: Level[];
  movements: Movement[];
  categories: Category[];
}) {
  const router = useRouter();
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(levels[0]?.id ?? null);

  const selectedLevel = levels.find((l) => l.id === selectedLevelId);

  async function addLevel() {
    const name = prompt("Nombre del nuevo nivel (ej: Nivel 6 - Mantenimiento)");
    if (!name) return;
    const res = await fetch("/api/profiles/levels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, name }),
    });
    const data = await res.json();
    setSelectedLevelId(data.id);
    router.refresh();
  }

  async function deleteLevel(levelId: string) {
    if (!confirm("¿Eliminar este nivel? Se borrarán todas sus reglas.")) return;
    await fetch(`/api/profiles/levels?id=${levelId}`, { method: "DELETE" });
    setSelectedLevelId(levels.find((l) => l.id !== levelId)?.id ?? null);
    router.refresh();
  }

  async function renameLevel(level: Level) {
    const name = prompt("Nuevo nombre del nivel", level.name);
    if (!name || name === level.name) return;
    await fetch("/api/profiles/levels", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: level.id, name }),
    });
    router.refresh();
  }

  return (
    <>
      {/* Tabs de niveles */}
      <section className="mb-4">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {levels.map((l) => (
            <button
              key={l.id}
              onClick={() => setSelectedLevelId(l.id)}
              className={`px-3 py-2 text-xs rounded-lg whitespace-nowrap ${
                selectedLevelId === l.id ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200"
              }`}
            >
              {l.name}
            </button>
          ))}
          <button
            onClick={addLevel}
            className="px-3 py-2 text-xs rounded-lg bg-white border border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-500"
          >
            + Nivel
          </button>
        </div>
      </section>

      {selectedLevel && (
        <>
          <section className="card mb-3">
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1">
                <h2 className="font-medium">{selectedLevel.name}</h2>
                <p className="text-xs text-neutral-500 mt-0.5">{selectedLevel.description}</p>
                <p className="text-xs text-neutral-400 mt-2">
                  {selectedLevel.rulesCount} reglas · {selectedLevel.patientsCount} pacientes activos
                </p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => renameLevel(selectedLevel)} className="btn btn-ghost text-xs">
                  Renombrar
                </button>
                <button onClick={() => deleteLevel(selectedLevel.id)} className="btn btn-ghost text-xs text-red-600">
                  Eliminar
                </button>
              </div>
            </div>
          </section>

          <LevelRulesEditor
            levelId={selectedLevel.id}
            rules={selectedLevel.rules}
            movements={movements}
            categories={categories}
          />
        </>
      )}
    </>
  );
}

function LevelRulesEditor({
  levelId,
  rules,
  movements,
  categories,
}: {
  levelId: string;
  rules: Rule[];
  movements: Movement[];
  categories: Category[];
}) {
  const router = useRouter();
  const [ruleMap, setRuleMap] = useState<Record<string, Rule>>(
    Object.fromEntries(rules.map((r) => [r.movementId, r]))
  );
  const [editingMov, setEditingMov] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const groups: Record<string, Movement[]> = {};
    for (const m of movements) {
      if (search && !m.displayName.toLowerCase().includes(search.toLowerCase())) continue;
      if (!groups[m.categoryId]) groups[m.categoryId] = [];
      groups[m.categoryId].push(m);
    }
    return groups;
  }, [movements, search]);

  function toggleCat(catId: string) {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  function getDisplay(mov: Movement): Rule {
    return (
      ruleMap[mov.id] ?? {
        movementId: mov.id,
        state: "OK",
        substitutionText: "",
        loadConstraint: "",
        physioWarning: "",
      }
    );
  }

  async function saveRule(mov: Movement, item: Rule) {
    const res = await fetch("/api/profiles/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ levelId, ...item }),
    });
    if (res.ok) {
      setRuleMap((prev) => ({ ...prev, [mov.id]: item }));
      setEditingMov(null);
      router.refresh();
    }
  }

  async function resetRule(mov: Movement) {
    if (!ruleMap[mov.id]) {
      setEditingMov(null);
      return;
    }
    await fetch(`/api/profiles/rules?levelId=${levelId}&movementId=${mov.id}`, { method: "DELETE" });
    setRuleMap((prev) => {
      const next = { ...prev };
      delete next[mov.id];
      return next;
    });
    setEditingMov(null);
    router.refresh();
  }

  return (
    <>
      <section className="mb-3">
        <input
          className="input"
          placeholder="🔍 Buscar movimiento..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>

      <div className="space-y-3">
        {categories
          .filter((cat) => grouped[cat.id]?.length > 0)
          .map((cat) => {
            const isCollapsed = collapsedCats.has(cat.id);
            const movs = grouped[cat.id];
            return (
              <section key={cat.id} className="card !p-0 overflow-hidden">
                <button
                  onClick={() => toggleCat(cat.id)}
                  className="w-full flex justify-between items-center px-4 py-3 hover:bg-neutral-50"
                >
                  <h3 className="font-medium text-sm">{cat.name}</h3>
                  <span className="text-neutral-400">{isCollapsed ? "▸" : "▾"}</span>
                </button>
                {!isCollapsed && (
                  <div className="border-t border-neutral-100">
                    {movs.map((mov) => {
                      const a = getDisplay(mov);
                      const isEditing = editingMov === mov.id;
                      return (
                        <div
                          key={mov.id}
                          className={`border-b border-neutral-100 last:border-0 ${
                            a.state === "BLOCKED"
                              ? "bg-red-50/50"
                              : a.state === "CONDITIONAL"
                              ? "bg-amber-50/50"
                              : ""
                          }`}
                        >
                          {!isEditing ? (
                            <button
                              onClick={() => setEditingMov(mov.id)}
                              className="w-full text-left px-4 py-2.5 hover:bg-white/60"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm">{mov.displayName}</div>
                                  {(a.substitutionText || a.loadConstraint) && (
                                    <div className="text-xs text-neutral-600 mt-0.5 truncate">
                                      {a.substitutionText && (
                                        <span className="text-red-700">→ {a.substitutionText}</span>
                                      )}
                                      {a.loadConstraint && (
                                        <span className="text-neutral-500"> · {a.loadConstraint}</span>
                                      )}
                                    </div>
                                  )}
                                  {a.physioWarning && (
                                    <div className="text-xs italic text-amber-800 mt-0.5">⚠ {a.physioWarning}</div>
                                  )}
                                </div>
                                <span
                                  className={
                                    a.state === "OK"
                                      ? "pill-ok"
                                      : a.state === "CONDITIONAL"
                                      ? "pill-warn"
                                      : "pill-block"
                                  }
                                >
                                  {a.state === "OK" ? "OK" : a.state === "CONDITIONAL" ? "Cond." : "Bloq."}
                                </span>
                              </div>
                            </button>
                          ) : (
                            <RuleInline
                              mov={mov}
                              current={a}
                              onSave={(item) => saveRule(mov, item)}
                              onCancel={() => setEditingMov(null)}
                              onReset={() => resetRule(mov)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
      </div>
    </>
  );
}

function RuleInline({
  mov,
  current,
  onSave,
  onCancel,
  onReset,
}: {
  mov: Movement;
  current: Rule;
  onSave: (item: Rule) => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const [item, setItem] = useState<Rule>(current);
  return (
    <div className="px-4 py-3 bg-white border-l-4 border-neutral-900">
      <div className="flex justify-between items-center mb-3">
        <div className="font-medium text-sm">{mov.displayName}</div>
        <button onClick={onCancel} className="text-xs text-neutral-400">✕ Cerrar</button>
      </div>
      <div className="space-y-2">
        <div className="flex gap-1">
          {(["OK", "CONDITIONAL", "BLOCKED"] as State[]).map((s) => (
            <button
              key={s}
              onClick={() => setItem({ ...item, state: s })}
              className={`flex-1 py-1.5 text-xs rounded ${
                item.state === s ? "bg-neutral-900 text-white" : "bg-neutral-100"
              }`}
            >
              {s === "OK" ? "OK" : s === "CONDITIONAL" ? "Cond." : "Bloq."}
            </button>
          ))}
        </div>
        <input
          className="input text-sm"
          placeholder="Sustituto"
          value={item.substitutionText}
          onChange={(e) => setItem({ ...item, substitutionText: e.target.value })}
        />
        <input
          className="input text-sm"
          placeholder="Carga máx"
          value={item.loadConstraint}
          onChange={(e) => setItem({ ...item, loadConstraint: e.target.value })}
        />
        <input
          className="input text-sm"
          placeholder="Aviso al paciente"
          value={item.physioWarning}
          onChange={(e) => setItem({ ...item, physioWarning: e.target.value })}
        />
        <div className="flex justify-between pt-1">
          <button onClick={onReset} className="text-xs text-neutral-500 underline">
            Volver a default (OK)
          </button>
          <button onClick={() => onSave(item)} className="btn btn-primary text-xs">
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
