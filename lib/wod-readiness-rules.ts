import { resolveReadinessLevel, type WodReadiness } from "./wod-readiness";

export type WodAdaptationRule = {
  movementId: string;
  state: string;
  loadConstraint: string | null;
  substitutionText: string | null;
  physioWarning: string | null;
};

export type OrderedWodRule = WodAdaptationRule & { levelOrder: number };

type ReadinessCategoryLevel = {
  id: string;
  categoryId: string;
  order: number;
  rules: readonly WodAdaptationRule[];
};

type ReadinessCategorySelection = {
  categoryId: string;
  categoryLevelId: string;
  redCategoryLevelId?: string | null;
  greenCategoryLevelId?: string | null;
  categoryLevel: ReadinessCategoryLevel | null;
  category: { levels: readonly ReadinessCategoryLevel[] };
};

function stateWeight(state: string): number {
  if (state === "BLOCKED") return 3;
  if (state === "CONDITIONAL") return 2;
  return 1;
}

function extractPct(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return isFinite(n) ? n : null;
}

/** Same priority as the stored category materialization: lower level order,
 * then stricter state, then lower percentage. Ties retain the earlier rule. */
export function isMoreRestrictive(a: OrderedWodRule, b: OrderedWodRule): boolean {
  if (a.levelOrder !== b.levelOrder) return a.levelOrder < b.levelOrder;
  const wa = stateWeight(a.state);
  const wb = stateWeight(b.state);
  if (wa !== wb) return wa > wb;
  const pa = extractPct(a.loadConstraint);
  const pb = extractPct(b.loadConstraint);
  if (pa != null && pb != null) return pa < pb;
  if (pa != null && pb == null) return true;
  return false;
}

/** Resolve a WOD's colour in memory. Never changes the patient's base levels
 * or materialized adaptations. A movement omitted from the target level is
 * OK by default, exactly as in the category editor. Manual exceptions,
 * unrelated legacy movements and patients without selections keep their rules. */
export function resolveReadinessAdaptations(
  adaptations: readonly (WodAdaptationRule & { isCustomized?: boolean })[],
  selections: readonly ReadinessCategorySelection[],
  readiness: WodReadiness,
): Map<string, WodAdaptationRule> {
  const result = new Map<string, WodAdaptationRule>(adaptations.map(rule => [rule.movementId, rule]));
  if (selections.length === 0) return result;

  // If the base selection itself is unavailable, its contribution cannot be
  // reconstructed safely. Preserve the current profile instead of relaxing it.
  if (selections.some(selection => !selection.categoryLevel ||
    selection.categoryLevel.id !== selection.categoryLevelId ||
    selection.categoryLevel.categoryId !== selection.categoryId)) return result;

  const chosen = new Map<string, OrderedWodRule>();
  const managedMovementIds = new Set<string>();
  for (const selection of selections) {
    const base = selection.categoryLevel!;
    const levels = selection.category.levels.filter(level => level.categoryId === selection.categoryId);
    const target = resolveReadinessLevel(selection.categoryLevelId, levels, readiness, selection) ?? base;

    // Catalogues store unrestricted movements as an absent rule. Clear the
    // materialized amber rule for movements managed by these categories even
    // when the chosen level has no row for them. Include every defined level
    // so an obsolete stored rule cannot leak in from a different level.
    for (const level of [base, ...levels]) {
      for (const rule of level.rules) managedMovementIds.add(rule.movementId);
    }
    for (const rule of target.rules) {
      const candidate = { ...rule, levelOrder: target.order };
      const previous = chosen.get(rule.movementId);
      if (!previous || isMoreRestrictive(candidate, previous)) chosen.set(rule.movementId, candidate);
    }
  }

  const customized = new Set(adaptations.filter(rule => rule.isCustomized).map(rule => rule.movementId));
  for (const movementId of managedMovementIds) {
    if (!customized.has(movementId)) result.delete(movementId);
  }
  for (const [movementId, rule] of chosen) {
    if (!customized.has(movementId)) result.set(movementId, rule);
  }
  return result;
}
