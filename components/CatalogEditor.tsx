"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Category = { id: string; name: string };
type Movement = {
  id: string;
  displayName: string;
  categoryId: string;
  aliases: string;
  isOverhead: boolean;
  isImpact: boolean;
  isKipping: boolean;
};

export function CatalogEditor({ categories, movements }: { categories: Category[]; movements: Movement[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Movement | null>(null);
  const [creatingIn, setCreatingIn] = useState<string | null>(null); // categoryId para nuevo ejercicio

  async function addCategory() {
    const name = prompt("Nombre del nuevo bloque (ej: Dominante de cadera)");
    if (!name) return;
    const res = await fetch("/api/movement-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => ({}))).error || "No se pudo crear");
  }
  async function renameCategory(c: Category) {
    const name = prompt("Nuevo nombre del bloque", c.name);
    if (!name || name === c.name) return;
    const res = await fetch("/api/movement-categories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, name }) });
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => ({}))).error || "No se pudo renombrar");
  }
  async function deleteCategory(c: Category) {
    // Pedimos al server cuánto se va a perder con el borrado en cascada
    // (movimientos, niveles, reglas, adaptaciones de pacientes, selecciones).
    // Lo mostramos en el confirm para que la decisión sea informada.
    let warning = "";
    try {
      const u = await fetch(`/api/movement-categories?id=${c.id}&usage=1`);
      if (u.ok) {
        const d = await u.json();
        const parts: string[] = [];
        if (d.movements) parts.push(`${d.movements} ejercicio(s)`);
        if (d.levels) parts.push(`${d.levels} nivel(es)`);
        if (d.categoryRules) parts.push(`${d.categoryRules} regla(s) de nivel`);
        if (d.patientSelections) parts.push(`${d.patientSelections} selección(es) de paciente`);
        if (d.adaptations) parts.push(`${d.adaptations} adaptación(es) de paciente`);
        if (d.clinicalRules) parts.push(`${d.clinicalRules} regla(s) de nivel clínico`);
        if (parts.length > 0) {
          warning = `\n\nSe eliminarán también: ${parts.join(", ")}.`;
        }
      }
    } catch {
      // si falla el conteo, seguimos sin warning detallado
    }
    if (!confirm(`¿Eliminar el bloque "${c.name}"?${warning}\n\nEsta acción no se puede deshacer.`)) return;
    const res = await fetch(`/api/movement-categories?id=${c.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => ({}))).error || "No se pudo eliminar");
  }
  async function deleteMovement(m: Movement) {
    // Antes de pedir confirmación, miramos cuántas referencias tiene para
    // que el CEO vea qué datos perderá. La API hace luego el borrado en
    // cascada (adaptaciones de pacientes + reglas de nivel).
    let warning = "";
    try {
      const u = await fetch(`/api/movements?id=${m.id}&usage=1`);
      if (u.ok) {
        const d = await u.json();
        const total = (d.adaptations ?? 0) + (d.clinicalRules ?? 0) + (d.categoryRules ?? 0);
        if (total > 0) {
          const parts: string[] = [];
          if (d.adaptations) parts.push(`${d.adaptations} adaptación(es) de paciente`);
          if (d.clinicalRules) parts.push(`${d.clinicalRules} regla(s) de nivel clínico`);
          if (d.categoryRules) parts.push(`${d.categoryRules} regla(s) de nivel de categoría`);
          warning = `\n\nSe eliminarán también: ${parts.join(", ")}.`;
        }
      }
    } catch {
      // si falla el conteo, seguimos sin warning detallado
    }
    if (!confirm(`¿Eliminar el ejercicio "${m.displayName}"?${warning}\n\nEsta acción no se puede deshacer.`)) return;
    const res = await fetch(`/api/movements?id=${m.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => ({}))).error || "No se pudo eliminar");
  }

  // ── Reordenar bloques con ↑/↓ ────────────────────────────────────────
  // Mandamos siempre la lista completa al endpoint PUT — más simple que
  // mover un elemento concreto y más robusto si dos personas reordenan
  // al mismo tiempo.
  async function moveCategory(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= categories.length) return;
    const next = categories.map((c) => c.id);
    [next[idx], next[target]] = [next[target], next[idx]];
    const res = await fetch("/api/movement-categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: next }),
    });
    if (res.ok) router.refresh();
    else alert((await res.json().catch(() => ({}))).error || "No se pudo reordenar");
  }

  const byCat: Record<string, Movement[]> = {};
  for (const m of movements) (byCat[m.categoryId] ??= []).push(m);

  return (
    <div>
      <div className="flex justify-between items-start gap-3 flex-wrap mb-4">
        <div>
          <h2 className="font-semibold text-lg">Catálogo de control de cargas</h2>
          <p className="text-xs text-neutral-500 mt-0.5">Bloques y ejercicios disponibles para los controles de cargas. {movements.length} ejercicios · {categories.length} bloques.</p>
        </div>
        <button onClick={addCategory} className="btn btn-primary text-sm">+ Nuevo bloque</button>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-12">No hay bloques todavía. Crea el primero.</p>
      ) : (
        <div className="space-y-3">
          {categories.map((c, idx) => {
            const movs = byCat[c.id] ?? [];
            const isFirst = idx === 0;
            const isLast = idx === categories.length - 1;
            return (
              <section key={c.id} className="card">
                <div className="flex justify-between items-center gap-2 mb-2">
                  <div className="flex items-center gap-1">
                    <div className="flex flex-col -my-1">
                      <button
                        onClick={() => moveCategory(idx, -1)}
                        disabled={isFirst}
                        className="text-neutral-400 hover:text-neutral-900 disabled:opacity-20 disabled:cursor-not-allowed leading-none px-1"
                        title="Subir bloque"
                      >▲</button>
                      <button
                        onClick={() => moveCategory(idx, 1)}
                        disabled={isLast}
                        className="text-neutral-400 hover:text-neutral-900 disabled:opacity-20 disabled:cursor-not-allowed leading-none px-1"
                        title="Bajar bloque"
                      >▼</button>
                    </div>
                    <h3 className="font-medium text-sm">{c.name}</h3>
                    <span className="text-xs text-neutral-400">{movs.length}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => renameCategory(c)} className="text-[11px] text-neutral-500 hover:underline">Renombrar</button>
                    <button onClick={() => deleteCategory(c)} className="text-[11px] text-red-600 hover:underline">Eliminar</button>
                    <button onClick={() => setCreatingIn(c.id)} className="text-[11px] text-blue-600 hover:underline">+ Ejercicio</button>
                  </div>
                </div>
                {movs.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic">Sin ejercicios.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {movs.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setEditing(m)}
                        className="text-xs px-2 py-1 rounded-lg border border-neutral-200 hover:border-neutral-400 flex items-center gap-1"
                        title="Editar"
                      >
                        {m.displayName}
                        {m.isOverhead && <span title="Overhead">🔼</span>}
                        {m.isImpact && <span title="Impacto">💥</span>}
                        {m.isKipping && <span title="Kipping">🔁</span>}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {(editing || creatingIn) && (
        <MovementModal
          categories={categories}
          movement={editing}
          defaultCategoryId={creatingIn}
          onClose={() => { setEditing(null); setCreatingIn(null); }}
          onSaved={() => { setEditing(null); setCreatingIn(null); router.refresh(); }}
          onDelete={editing ? () => { deleteMovement(editing); setEditing(null); } : undefined}
        />
      )}
    </div>
  );
}

function MovementModal({
  categories,
  movement,
  defaultCategoryId,
  onClose,
  onSaved,
  onDelete,
}: {
  categories: Category[];
  movement: Movement | null;
  defaultCategoryId: string | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [displayName, setDisplayName] = useState(movement?.displayName ?? "");
  const [categoryId, setCategoryId] = useState(movement?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "");
  const [aliases, setAliases] = useState(movement?.aliases ?? "");
  const [isOverhead, setIsOverhead] = useState(movement?.isOverhead ?? false);
  const [isImpact, setIsImpact] = useState(movement?.isImpact ?? false);
  const [isKipping, setIsKipping] = useState(movement?.isKipping ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!displayName.trim()) { setError("El nombre es obligatorio."); return; }
    setSaving(true);
    setError("");
    const payload = { displayName, categoryId, aliases, isOverhead, isImpact, isKipping };
    const res = await fetch("/api/movements", {
      method: movement ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(movement ? { id: movement.id, ...payload } : payload),
    });
    if (res.ok) onSaved();
    else { setError((await res.json().catch(() => ({}))).error || "No se pudo guardar."); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">{movement ? "Editar ejercicio" : "Nuevo ejercicio"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
            <input className="input text-sm" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Bloque</label>
            <select className="input text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Alias / abreviaturas (separadas por comas)</label>
            <input className="input text-sm" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="thr,thrusters,th" />
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={isOverhead} onChange={(e) => setIsOverhead(e.target.checked)} className="w-4 h-4 accent-neutral-900" /> Overhead</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={isImpact} onChange={(e) => setIsImpact(e.target.checked)} className="w-4 h-4 accent-neutral-900" /> Impacto</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={isKipping} onChange={(e) => setIsKipping(e.target.checked)} className="w-4 h-4 accent-neutral-900" /> Kipping</label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-between items-center gap-2 pt-2 border-t border-neutral-100">
            {onDelete ? <button onClick={onDelete} className="text-sm text-red-600 hover:underline">Eliminar</button> : <span />}
            <div className="flex gap-2">
              <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
              <button onClick={save} disabled={saving} className="btn btn-primary text-sm">{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
