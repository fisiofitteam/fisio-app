"use client";
/**
 * Panel de control de cargas por categoría (sustituye la zona de dolor + perfil clínico).
 *
 * Por cada categoría con niveles definidos, un dropdown con los niveles
 * disponibles. Cambiar = PUT al endpoint que materializa las reglas.
 *
 * Encima del panel: botón "💡 Sugerir control con IA" que abre modal con
 * la propuesta de la IA y un botón "Aprobar plan" que aplica todas las
 * selecciones de una vez.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

type CatalogEntry = {
  categoryId: string;
  categoryName: string;
  levels: Array<{ id: string; name: string; description: string | null; order: number }>;
};
type Selection = { categoryId: string; categoryLevelId: string | null };

export function PatientCategoryLevelsPanel({
  patientId,
  catalog,
  initialSelections,
}: {
  patientId: string;
  catalog: CatalogEntry[];
  initialSelections: Selection[];
}) {
  const router = useRouter();
  const initial = new Map(initialSelections.map((s) => [s.categoryId, s.categoryLevelId]));
  const [selections, setSelections] = useState<Map<string, string | null>>(initial);
  const [savingCat, setSavingCat] = useState<string | null>(null);

  async function pickLevel(categoryId: string, levelId: string) {
    if (levelId === selections.get(categoryId)) return;
    setSavingCat(categoryId);
    try {
      const r = await fetch("/api/patient-category-levels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, categoryId, categoryLevelId: levelId }),
      });
      if (r.ok) {
        const n = new Map(selections);
        n.set(categoryId, levelId);
        setSelections(n);
        router.refresh();
      } else {
        const d = await r.json().catch(() => ({}));
        alert(d?.error ?? "No se pudo guardar");
      }
    } finally {
      setSavingCat(null);
    }
  }

  if (catalog.length === 0) {
    return (
      <section className="card bg-amber-50 border-amber-200">
        <p className="text-sm text-amber-900">
          ⚠ No hay niveles definidos en el catálogo todavía.
        </p>
        <a href="/fisio/biblioteca/niveles-categoria" className="text-xs text-amber-800 underline mt-2 block">
          Ir a Biblioteca → Niveles por categoría para configurarlos
        </a>
      </section>
    );
  }

  return (
    <section className="card">
      <header className="mb-3">
        <h2 className="font-medium text-sm">📦 Niveles por categoría</h2>
        <p className="text-[11px] text-neutral-500 mt-0.5">
          El control de cargas del paciente se compone seleccionando un nivel por cada categoría. Al cambiar uno, las reglas del nivel se aplican automáticamente a sus adaptaciones.
        </p>
      </header>
      <div className="space-y-2">
        {catalog.map((c) => {
          const currentLevelId = selections.get(c.categoryId) ?? null;
          return (
            <div key={c.categoryId} className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium w-32 flex-shrink-0">{c.categoryName}</span>
              <select
                className="input text-xs flex-1"
                value={currentLevelId ?? ""}
                onChange={(e) => e.target.value && pickLevel(c.categoryId, e.target.value)}
                disabled={savingCat === c.categoryId}
              >
                <option value="">— Sin nivel asignado —</option>
                {c.levels.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              {savingCat === c.categoryId && (
                <span className="text-[10px] text-neutral-400">Guardando…</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
