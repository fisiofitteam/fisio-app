"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveReadinessLevel, usesWodReadiness, type WodReadiness } from "@/lib/wod-readiness";

type CatalogEntry = {
  categoryId: string;
  categoryName: string;
  levels: Array<{ id: string; name: string; description: string | null; order: number }>;
};
type Selection = {
  categoryId: string;
  categoryLevelId: string | null;
  redCategoryLevelId?: string | null;
  greenCategoryLevelId?: string | null;
};

export function PatientCategoryLevelsPanel({
  patientId, programType, catalog, initialSelections,
}: {
  patientId: string;
  programType: string | null;
  catalog: CatalogEntry[];
  initialSelections: Selection[];
}) {
  const router = useRouter();
  const [selections, setSelections] = useState(initialSelections);
  const [savingCat, setSavingCat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasReadiness = usesWodReadiness(programType);
  useEffect(() => setSelections(initialSelections), [initialSelections]);

  async function pickLevel(categoryId: string, levelId: string | null, readiness: WodReadiness = "AMBER") {
    const current = selections.find(s => s.categoryId === categoryId);
    const field = readiness === "RED" ? "redCategoryLevelId" : readiness === "GREEN" ? "greenCategoryLevelId" : "categoryLevelId";
    if ((current?.[field] ?? null) === levelId) return;
    setSavingCat(categoryId);
    setError(null);
    try {
      const response = await fetch("/api/patient-category-levels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, categoryId, categoryLevelId: levelId, readiness }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "No se pudo guardar el nivel.");
      }
      setSelections(previous => {
        const existing = previous.find(s => s.categoryId === categoryId);
        const next = { ...(existing ?? { categoryId, categoryLevelId: null }), [field]: levelId };
        return [...previous.filter(s => s.categoryId !== categoryId), next];
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      setSavingCat(null);
    }
  }

  if (!catalog.length) return (
    <section className="card bg-amber-50 border-amber-200">
      <p className="text-sm text-amber-900">No hay niveles definidos en el catálogo todavía.</p>
      <a href="/fisio/biblioteca/niveles-categoria" className="text-xs text-amber-800 underline mt-2 block">
        Ir a Biblioteca → Niveles por categoría para configurarlos
      </a>
    </section>
  );

  return (
    <section className="card">
      <header className="mb-4">
        <h2 className="font-medium text-sm">{hasReadiness ? "Semáforo del WOD por categoría" : "Niveles por categoría"}</h2>
        <p className="text-xs text-neutral-500 mt-1">
          {hasReadiness
            ? "Ámbar es el nivel habitual. Por defecto, rojo usa el nivel anterior y verde el siguiente, sin salir de los niveles disponibles. Puedes elegir otro nivel para cada color."
            : "Selecciona un nivel por categoría para aplicar sus reglas al control de cargas del paciente."}
        </p>
        {hasReadiness && <p className="mt-1 text-xs text-neutral-500">Los niveles personalizados de rojo y verde se mantienen aunque cambies el nivel ámbar. Las excepciones manuales por movimiento se respetan en los tres colores.</p>}
      </header>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      <div className="space-y-3">
        {catalog.map(category => {
          const selection = selections.find(s => s.categoryId === category.categoryId);
          const baseId = selection?.categoryLevelId ?? null;
          const base = resolveReadinessLevel(baseId, category.levels, "AMBER");
          const busy = savingCat !== null;
          const automaticRed = resolveReadinessLevel(baseId, category.levels, "RED");
          const automaticGreen = resolveReadinessLevel(baseId, category.levels, "GREEN");
          return (
            <fieldset key={category.categoryId} className={hasReadiness ? "rounded-lg border border-neutral-200 p-3" : "flex flex-wrap items-center gap-2"}>
              <legend className={hasReadiness ? "px-1 text-sm font-semibold" : "text-sm font-medium"}>{category.categoryName}</legend>
              <div className={hasReadiness ? "grid gap-3 sm:grid-cols-3" : "flex-1"}>
                {hasReadiness && <label className="block rounded-md bg-red-50 p-2 text-xs font-medium text-red-900">
                    Rojo · Reducir
                    <select aria-label={category.categoryName + " · Rojo"} className="input mt-1 w-full text-xs font-normal text-neutral-900"
                      value={selection?.redCategoryLevelId ?? ""} disabled={busy || !base}
                      onChange={event => void pickLevel(category.categoryId, event.target.value || null, "RED")}>
                      <option value="">Automático{automaticRed ? " · " + automaticRed.name : " · asigna un nivel base"}</option>
                      {category.levels.map(level => <option key={level.id} value={level.id}>{level.name} · Personalizado</option>)}
                    </select>
                  </label>}
                <label className={hasReadiness ? "block rounded-md bg-amber-50 p-2 text-xs font-medium text-amber-900" : "block text-xs text-neutral-700"}>
                  {hasReadiness ? "Ámbar · Nivel habitual" : "Nivel asignado"}
                  <select aria-label={category.categoryName + (hasReadiness ? " · Ámbar" : " · Nivel asignado")}
                    className="input mt-1 w-full text-xs font-normal text-neutral-900" value={baseId ?? ""} disabled={busy}
                    onChange={event => event.target.value && void pickLevel(category.categoryId, event.target.value)}>
                    <option value="">— Sin nivel asignado —</option>
                    {category.levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}
                  </select>
                </label>
                {hasReadiness && <label className="block rounded-md bg-emerald-50 p-2 text-xs font-medium text-emerald-900">
                  Verde · Progresar
                  <select aria-label={category.categoryName + " · Verde"} className="input mt-1 w-full text-xs font-normal text-neutral-900"
                    value={selection?.greenCategoryLevelId ?? ""} disabled={busy || !base}
                    onChange={event => void pickLevel(category.categoryId, event.target.value || null, "GREEN")}>
                    <option value="">Automático{base ? " · " + (automaticGreen?.name ?? base.name) : " · asigna un nivel base"}</option>
                    {category.levels.map(level => <option key={level.id} value={level.id}>{level.name} · Personalizado</option>)}
                  </select>
                </label>}
              </div>
              {savingCat === category.categoryId && <p role="status" className="mt-2 text-xs text-neutral-500">Guardando…</p>}
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}
