"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

type State = "OK" | "CONDITIONAL" | "BLOCKED";

type Adaptation = {
  movementId: string;
  state: State;
  substitutionText: string;
  loadConstraint: string;
  physioWarning: string;
};

type Movement = {
  id: string;
  displayName: string;
  categoryId: string;
  categoryName: string;
};

type Category = {
  id: string;
  name: string;
};

type ClinicalLevel = {
  id: string;
  name: string;
  order: number;
};

type ClinicalProfile = {
  id: string;
  name: string;
  levels: ClinicalLevel[];
};

export function AdaptationEditor({
  patientId,
  appliedLevelId,
  existing,
  movements,
  categories,
  profiles,
}: {
  patientId: string;
  appliedLevelId: string | null;
  existing: Adaptation[];
  movements: Movement[];
  categories: Category[];
  profiles: ClinicalProfile[];
}) {
  const router = useRouter();
  const [adaptations, setAdaptations] = useState<Record<string, Adaptation>>(
    Object.fromEntries(existing.map((a) => [a.movementId, a]))
  );
  const [editingMov, setEditingMov] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  // Selector de perfil/nivel
  const initialProfile = profiles.find((p) => p.levels.some((l) => l.id === appliedLevelId));
  const initialLevel = initialProfile?.levels.find((l) => l.id === appliedLevelId);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(initialProfile?.id ?? "");
  const [selectedLevelId, setSelectedLevelId] = useState<string>(initialLevel?.id ?? "");

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  // Filtrar y agrupar
  const grouped = useMemo(() => {
    const groups: Record<string, Movement[]> = {};
    for (const m of movements) {
      if (search && !m.displayName.toLowerCase().includes(search.toLowerCase())) continue;
      if (!groups[m.categoryId]) groups[m.categoryId] = [];
      groups[m.categoryId].push(m);
    }
    return groups;
  }, [movements, search]);

  const stats = useMemo(() => {
    const total = movements.length;
    const ok = movements.filter((m) => !adaptations[m.id] || adaptations[m.id].state === "OK").length;
    const cond = movements.filter((m) => adaptations[m.id]?.state === "CONDITIONAL").length;
    const blocked = movements.filter((m) => adaptations[m.id]?.state === "BLOCKED").length;
    return { total, ok, cond, blocked };
  }, [movements, adaptations]);

  // Estado resumido de cada categoría a partir de sus movimientos
  function catFlags(movs: Movement[]) {
    let hasBlocked = false;
    let hasCond = false;
    for (const m of movs) {
      const s = adaptations[m.id]?.state ?? "OK";
      if (s === "BLOCKED") hasBlocked = true;
      else if (s === "CONDITIONAL") hasCond = true;
    }
    return { hasBlocked, hasCond };
  }

  // Categorías visibles, ordenadas: primero las que tienen bloqueados, luego
  // condicionales, luego las que están todo OK. (orden estable = alfabético dentro)
  const sortedCategories = useMemo(() => {
    return categories
      .filter((cat) => grouped[cat.id]?.length > 0)
      .map((cat) => {
        const { hasBlocked, hasCond } = catFlags(grouped[cat.id]);
        return { cat, hasBlocked, hasCond, severity: hasBlocked ? 2 : hasCond ? 1 : 0 };
      })
      .sort((a, b) => b.severity - a.severity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, grouped, adaptations]);

  function toggleCat(catId: string) {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  async function saveAdaptation(mov: Movement, item: Adaptation) {
    const res = await fetch("/api/adaptations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, ...item }),
    });
    if (res.ok) {
      setAdaptations((prev) => ({ ...prev, [mov.id]: item }));
      setEditingMov(null);
      router.refresh();
    }
  }

  async function resetToOk(mov: Movement) {
    // Si existe adaptación, la borramos (volverá a default OK)
    const existing = adaptations[mov.id];
    if (!existing) {
      setEditingMov(null);
      return;
    }
    await fetch(`/api/adaptations?patientId=${patientId}&movementId=${mov.id}`, { method: "DELETE" });
    setAdaptations((prev) => {
      const next = { ...prev };
      delete next[mov.id];
      return next;
    });
    setEditingMov(null);
    router.refresh();
  }

  async function applyLevel() {
    if (!selectedLevelId) return;
    if (
      !confirm(
        "Esto va a sobrescribir TODAS las adaptaciones actuales del paciente con las del nivel seleccionado. ¿Continuar?"
      )
    )
      return;

    setApplying(true);
    const res = await fetch("/api/adaptations/apply-level", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, levelId: selectedLevelId }),
    });
    if (res.ok) {
      const data = await res.json();
      const newAdapts: Record<string, Adaptation> = {};
      for (const a of data.adaptations) {
        newAdapts[a.movementId] = {
          movementId: a.movementId,
          state: a.state,
          substitutionText: a.substitutionText ?? "",
          loadConstraint: a.loadConstraint ?? "",
          physioWarning: a.physioWarning ?? "",
        };
      }
      setAdaptations(newAdapts);
      router.refresh();
    }
    setApplying(false);
  }

  function getDisplay(mov: Movement): Adaptation {
    return (
      adaptations[mov.id] ?? {
        movementId: mov.id,
        state: "OK",
        substitutionText: "",
        loadConstraint: "",
        physioWarning: "",
      }
    );
  }

  return (
    <>
      {/* Selector de perfil clínico */}
      <section className="card mb-3">
        <h2 className="font-medium mb-3">Perfil clínico aplicado</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <select
            className="input"
            value={selectedProfileId}
            onChange={(e) => {
              setSelectedProfileId(e.target.value);
              setSelectedLevelId("");
            }}
          >
            <option value="">— Sin perfil —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={selectedLevelId}
            onChange={(e) => setSelectedLevelId(e.target.value)}
            disabled={!selectedProfile}
          >
            <option value="">— Selecciona nivel —</option>
            {selectedProfile?.levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={applyLevel}
          disabled={!selectedLevelId || applying || selectedLevelId === appliedLevelId}
          className="btn btn-primary w-full disabled:opacity-50"
        >
          {applying
            ? "Aplicando..."
            : selectedLevelId === appliedLevelId
            ? "Nivel ya aplicado"
            : "Aplicar nivel a este paciente"}
        </button>
        <p className="text-xs text-neutral-500 mt-2">
          También puedes editar los movimientos uno a uno abajo. Lo que edites manualmente se mantendrá hasta que apliques un nuevo nivel.
        </p>
      </section>

      {/* Resumen */}
      <section className="card mb-3">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-neutral-100 p-2 rounded">
            <div className="text-lg font-semibold">{stats.total}</div>
            <div className="text-xs text-neutral-500">Total</div>
          </div>
          <div className="bg-emerald-50 p-2 rounded">
            <div className="text-lg font-semibold text-emerald-800">{stats.ok}</div>
            <div className="text-xs text-emerald-700">OK</div>
          </div>
          <div className="bg-amber-50 p-2 rounded">
            <div className="text-lg font-semibold text-amber-800">{stats.cond}</div>
            <div className="text-xs text-amber-700">Cond.</div>
          </div>
          <div className="bg-red-50 p-2 rounded">
            <div className="text-lg font-semibold text-red-800">{stats.blocked}</div>
            <div className="text-xs text-red-700">Bloq.</div>
          </div>
        </div>
      </section>

      {/* Buscador */}
      <section className="mb-3">
        <input
          className="input"
          placeholder="🔍 Buscar movimiento..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>

      {/* Tabla por categorías */}
      <div className="space-y-3">
        {sortedCategories.map(({ cat, hasBlocked, hasCond }) => {
            const isCollapsed = collapsedCats.has(cat.id);
            const movs = grouped[cat.id];
            return (
              <section key={cat.id} className="card !p-0 overflow-hidden">
                <button
                  onClick={() => toggleCat(cat.id)}
                  className="w-full flex justify-between items-center px-4 py-3 hover:bg-neutral-50 gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-medium text-sm">{cat.name}</h3>
                    {/* Etiquetas del bloque, visibles sin desplegar */}
                    {hasBlocked && <span className="pill-block">Bloq.</span>}
                    {hasCond && <span className="pill-warn">Cond.</span>}
                    {!hasBlocked && !hasCond && <span className="pill-ok">OK</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-neutral-400">{movs.length}</span>
                    <span className="text-neutral-400">{isCollapsed ? "▸" : "▾"}</span>
                  </div>
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
                                    <div className="text-xs italic text-amber-800 mt-0.5">
                                      ⚠ {a.physioWarning}
                                    </div>
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
                            <InlineEditor
                              mov={mov}
                              current={a}
                              onSave={(item) => saveAdaptation(mov, item)}
                              onCancel={() => setEditingMov(null)}
                              onReset={() => resetToOk(mov)}
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

function InlineEditor({
  mov,
  current,
  onSave,
  onCancel,
  onReset,
}: {
  mov: Movement;
  current: Adaptation;
  onSave: (item: Adaptation) => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const [item, setItem] = useState<Adaptation>(current);

  return (
    <div className="px-4 py-3 bg-white border-l-4 border-neutral-900">
      <div className="flex justify-between items-center mb-3">
        <div className="font-medium text-sm">{mov.displayName}</div>
        <button onClick={onCancel} className="text-xs text-neutral-400">
          ✕ Cerrar
        </button>
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
          placeholder="Sustituto (ej: Ring row inclinado)"
          value={item.substitutionText}
          onChange={(e) => setItem({ ...item, substitutionText: e.target.value })}
        />
        <input
          className="input text-sm"
          placeholder="Carga máx (ej: 16 kg, 60% 1RM, BW)"
          value={item.loadConstraint}
          onChange={(e) => setItem({ ...item, loadConstraint: e.target.value })}
        />
        <input
          className="input text-sm"
          placeholder="Aviso al paciente (ej: si dolor > 5, parar)"
          value={item.physioWarning}
          onChange={(e) => setItem({ ...item, physioWarning: e.target.value })}
        />
        <div className="flex justify-between gap-2 pt-1">
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
