// Run: node scripts/test-wod-readiness-rules.cjs
// Real pure helpers and adaptWod, with isolated Prisma mocks. No database or network.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const state = { adaptations: [], selections: [] };
const effects = { adaptationReads: 0, selectionReads: 0, writes: 0 };
function readOnlyModel(model, handler) {
  return new Proxy({}, {
    get(_target, operation) {
      if (operation === "findMany") return handler;
      effects.writes++;
      throw new Error("Forbidden Prisma operation: " + model + "." + String(operation));
    },
  });
}
const prisma = new Proxy({
  patientAdaptation: readOnlyModel("patientAdaptation", async (args) => {
    effects.adaptationReads++;
    assert.equal(args.where.patientId, "patient-test");
    return state.adaptations;
  }),
  patientCategoryLevel: readOnlyModel("patientCategoryLevel", async (args) => {
    effects.selectionReads++;
    assert.equal(args.where.patientId, "patient-test");
    assert.equal(args.include.categoryLevel.include.rules, true);
    assert.equal(args.include.category.include.levels.include.rules, true);
    return state.selections;
  }),
}, {
  get(target, model) {
    if (Object.prototype.hasOwnProperty.call(target, model)) return target[model];
    effects.writes++;
    throw new Error("Forbidden Prisma model: " + String(model));
  },
});
const allowlist = new Set(["wod-readiness.ts", "wod-readiness-rules.ts", "wodParser.ts"]);
const cache = new Map();
function load(file) {
  assert(allowlist.has(file), "Unexpected local module: " + file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const source = ts.transpileModule(fs.readFileSync(path.join(root, "lib", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports,
    require(id) {
      if (id === "./prisma" || id === "@/lib/prisma") return { prisma };
      if (id.startsWith("./")) return load(id.slice(2) + ".ts");
      if (id.startsWith("@/lib/")) return load(id.slice(6) + ".ts");
      throw new Error("Unexpected import: " + id);
    },
    console,
    fetch() { throw new Error("Network access forbidden"); },
  });
  return mod.exports;
}
const { resolveReadinessLevel } = load("wod-readiness.ts");
const { resolveReadinessAdaptations, isMoreRestrictive } = load("wod-readiness-rules.ts");
const { adaptWod } = load("wodParser.ts");
const json = (value) => JSON.parse(JSON.stringify(value));
const rule = (movementId, state = "CONDITIONAL", loadConstraint = "50%", marker = "rule") => ({
  movementId, state, loadConstraint, substitutionText: marker, physioWarning: marker + " warning",
});
const level = (id, order, rules = [], categoryId = "cat-a") => ({ id, order, rules, categoryId });
function selection(base, levels, overrides = {}, categoryId = base?.categoryId ?? "cat-a") {
  return {
    categoryId, categoryLevelId: base?.id ?? "missing", categoryLevel: base,
    category: { levels }, ...overrides,
  };
}
const parsed = [{ raw: "10 Squat", matchedMovementId: "squat", matchedMovementName: "Squat" }];
function reset() {
  state.adaptations = [];
  state.selections = [];
  effects.adaptationReads = 0;
  effects.selectionReads = 0;
}
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("readiness follows defined neighbours through order gaps and clamps boundaries", () => {
  const levels = [level("high", 9), level("low", 1), level("base", 5)];
  const before = JSON.stringify(levels);
  assert.equal(resolveReadinessLevel("base", levels, "RED").id, "low");
  assert.equal(resolveReadinessLevel("base", levels, "GREEN").id, "high");
  assert.equal(resolveReadinessLevel("base", levels, "AMBER").id, "base");
  assert.equal(resolveReadinessLevel("low", levels, "RED").id, "low");
  assert.equal(resolveReadinessLevel("high", levels, "GREEN").id, "high");
  assert.equal(resolveReadinessLevel("missing", levels, "RED"), null);
  assert.equal(resolveReadinessLevel("base", [], "GREEN"), null);
  assert.equal(JSON.stringify(levels), before, "catalogue order remains unchanged");
});

test("explicit valid overrides win, invalid overrides fall back, AMBER stays base", () => {
  const levels = [level("one", 1), level("two", 5), level("three", 9), level("four", 15)];
  const overrides = { redCategoryLevelId: "one", greenCategoryLevelId: "four" };
  assert.equal(resolveReadinessLevel("three", levels, "RED", overrides).id, "one");
  assert.equal(resolveReadinessLevel("two", levels, "GREEN", overrides).id, "four");
  assert.equal(resolveReadinessLevel("two", levels, "AMBER", overrides).id, "two");
  assert.equal(resolveReadinessLevel("two", levels, "RED", { redCategoryLevelId: "unknown" }).id, "one");
  assert.equal(resolveReadinessLevel("two", levels, "GREEN", { greenCategoryLevelId: "unknown" }).id, "three");
});

test("cross-category comparator uses lower order, then state, then lower percentage", () => {
  const candidate = (order, state, load) => ({ ...rule("squat", state, load), levelOrder: order });
  assert.equal(isMoreRestrictive(candidate(2, "OK", "90%"), candidate(7, "BLOCKED", "10%")), true);
  assert.equal(isMoreRestrictive(candidate(7, "BLOCKED", "10%"), candidate(2, "OK", "90%")), false);
  assert.equal(isMoreRestrictive(candidate(2, "BLOCKED", null), candidate(2, "CONDITIONAL", "10%")), true);
  assert.equal(isMoreRestrictive(candidate(2, "CONDITIONAL", "hasta 40 %"), candidate(2, "CONDITIONAL", "60%")), true);
  assert.equal(isMoreRestrictive(candidate(2, "OK", "50%"), candidate(2, "OK", null)), true);
  assert.equal(isMoreRestrictive(candidate(2, "OK", null), candidate(2, "OK", "50%")), false);
  assert.equal(isMoreRestrictive(candidate(2, "OK", "50%"), candidate(2, "OK", "50%")), false);
});

test("legacy adaptations survive without selections", () => {
  const current = [rule("squat", "BLOCKED", null, "legacy")];
  for (const readiness of ["RED", "AMBER", "GREEN"]) {
    assert.deepEqual(json([...resolveReadinessAdaptations(current, [], readiness).values()]), current);
  }
});

test("custom adaptations always override selected-level rules across categories", () => {
  const current = [{ ...rule("squat", "OK", "75%", "custom"), isCustomized: true }];
  const low = level("low", 1, [rule("squat", "BLOCKED", null, "low")]);
  const base = level("base", 5, [rule("squat", "CONDITIONAL", "40%", "base")]);
  const high = level("high", 9, [rule("squat", "OK", "100%", "high")]);
  const other = level("other", 0, [rule("squat", "BLOCKED", null, "other")], "cat-b");
  for (const readiness of ["RED", "AMBER", "GREEN"]) {
    const result = resolveReadinessAdaptations(current, [selection(base, [high, low, base]), selection(other, [other])], readiness);
    assert.equal(result.get("squat").state, "OK");
    assert.equal(result.get("squat").loadConstraint, "75%");
    assert.equal(result.get("squat").substitutionText, "custom");
  }
});

test("target rules win and omitted target movements become OK instead of inheriting amber", () => {
  const base = level("base", 5, [rule("squat", "CONDITIONAL", "50%", "base"), rule("press", "BLOCKED", null, "base-press")]);
  const high = level("high", 9, [rule("squat", "OK", "90%", "high")]);
  const result = resolveReadinessAdaptations([rule("squat", "BLOCKED"), rule("press", "BLOCKED", null, "stored-press"), rule("run", "CONDITIONAL", "30%", "current-run")], [selection(base, [base, high])], "GREEN");
  assert.equal(result.get("squat").substitutionText, "high");
  assert.equal(result.has("press"), false, "a missing target rule means OK, as shown in the catalogue editor");
  assert.equal(result.get("run").substitutionText, "current-run", "unrelated legacy adaptation is preserved");
});

test("an omitted target rule does not cancel a restriction from another selected category", () => {
  const base = level("base", 5, [rule("squat", "BLOCKED", null, "base-five")]);
  const low = level("low", 1, []);
  const other = level("other", 3, [rule("squat", "CONDITIONAL", "40%", "other-three")], "cat-b");
  for (const selections of [[selection(base, [low, base]), selection(other, [other])], [selection(other, [other]), selection(base, [low, base])]]) {
    const result = resolveReadinessAdaptations([rule("squat", "BLOCKED", null, "stored")], selections, "RED");
    assert.equal(result.get("squat").substitutionText, "other-three");
    assert.equal(result.get("squat").state, "CONDITIONAL");
  }
});

test("empty chosen levels clear managed stale rules but retain manual and unrelated rules", () => {
  const low = level("low", 1, [rule("squat", "BLOCKED"), rule("press", "BLOCKED")]);
  const base = level("base", 5, []);
  const high = level("high", 9, []);
  const current = [rule("squat", "BLOCKED", null, "stale-low"), { ...rule("press", "BLOCKED", null, "manual"), isCustomized: true }, rule("run", "CONDITIONAL", "30%", "legacy")];
  for (const readiness of ["AMBER", "GREEN"]) {
    const result = resolveReadinessAdaptations(current, [selection(base, [low, base, high])], readiness);
    assert.equal(result.has("squat"), false, "managed movement is detected even if absent from both base and target");
    assert.equal(result.get("press").substitutionText, "manual");
    assert.equal(result.get("run").substitutionText, "legacy");
  }
});

test("an explicit override to an empty level means OK and does not inherit base rules", () => {
  const low = level("low", 1, [rule("squat", "BLOCKED", null, "low")]);
  const base = level("base", 5, [rule("squat", "CONDITIONAL", "50%", "base")]);
  const high = level("high", 9, []);
  const selectionWithOverrides = selection(base, [low, base, high], { redCategoryLevelId: "high", greenCategoryLevelId: "low" });
  assert.equal(resolveReadinessAdaptations([rule("squat", "CONDITIONAL", "50%", "stored")], [selectionWithOverrides], "RED").has("squat"), false);
  assert.equal(resolveReadinessAdaptations([], [selectionWithOverrides], "GREEN").get("squat").substitutionText, "low");
});

test("readiness combines cross-category rules using shared comparator", () => {
  const first = level("first", 3, [rule("squat", "CONDITIONAL", "70%", "first")]);
  const second = level("second", 3, [rule("squat", "CONDITIONAL", "40%", "second")], "cat-b");
  assert.equal(resolveReadinessAdaptations([], [selection(first, [first]), selection(second, [second])], "AMBER").get("squat").substitutionText, "second");
  const lower = level("lower", 1, [rule("squat", "OK", "90%", "lower")], "cat-c");
  assert.equal(resolveReadinessAdaptations([], [selection(first, [first]), selection(lower, [lower])], "AMBER").get("squat").substitutionText, "lower");
});

test("missing or incompatible base selection preserves the whole current map", () => {
  const current = [rule("squat", "BLOCKED", null, "current")];
  const valid = level("valid", 3, [rule("squat", "OK", "100%", "would-relax")]);
  const brokenSelections = [
    selection(null, []),
    { ...selection(valid, [valid]), categoryLevelId: "different-base" },
    selection(valid, [valid], {}, "wrong-category"),
  ];
  for (const broken of brokenSelections) {
    const result = resolveReadinessAdaptations(current, [selection(valid, [valid]), broken], "GREEN");
    assert.deepEqual(json([...result.values()]), current);
  }
});

test("valid base absent from catalogue remains usable and inputs are not mutated", () => {
  const base = level("base", 5, [rule("squat", "CONDITIONAL", "50%", "base")]);
  const selections = [selection(base, [level("other", 9, [])])];
  const current = [rule("squat", "BLOCKED", null, "current")];
  const before = JSON.stringify({ current, selections });
  const result = resolveReadinessAdaptations(current, selections, "GREEN");
  assert.equal(result.get("squat").substitutionText, "base");
  assert.equal(JSON.stringify({ current, selections }), before);
});

test("adaptWod without readiness keeps legacy behaviour and skips selection reads", async () => {
  reset();
  state.adaptations = [rule("squat", "CONDITIONAL", "40 kg", "squat"), rule("sibling", "CONDITIONAL", "30 kg", "sibling")];
  const result = await adaptWod([...parsed.map(line => ({ ...line, relatedMovementIds: ["sibling"] })), { raw: "header" }, { raw: "10 Run", matchedMovementId: "run" }], "patient-test");
  assert.equal(effects.adaptationReads, 1);
  assert.equal(effects.selectionReads, 0);
  assert.equal(result[0].state, "CONDITIONAL");
  assert.equal(result[0].adaptedLoad, "30 kg");
  assert.match(result[0].substitutionText, /squat/);
  assert.match(result[0].substitutionText, /sibling/);
  assert.deepEqual(json(result[1]), { raw: "header" });
  assert.equal(result[2].state, "OK");
});

test("adaptWod readiness reads selections once and applies ephemeral rules without writes", async () => {
  reset();
  state.adaptations = [rule("squat", "BLOCKED", null, "stored")];
  const base = level("base", 5, [rule("squat", "CONDITIONAL", "50%", "base")]);
  const high = level("high", 9, [rule("squat", "OK", "90%", "green")]);
  state.selections = [selection(base, [base, high])];
  const before = JSON.stringify(state);
  const result = await adaptWod(parsed, "patient-test", "GREEN");
  assert.equal(effects.adaptationReads, 1);
  assert.equal(effects.selectionReads, 1);
  assert.equal(result[0].state, "OK");
  assert.equal(result[0].adaptedLoad, "90%");
  assert.equal(result[0].substitutionText, "green");
  assert.equal(JSON.stringify(state), before);
  assert.equal(effects.writes, 0);
});

test("adaptWod resolves three colours independently including an implicit green OK", async () => {
  reset();
  state.adaptations = [rule("squat", "CONDITIONAL", "50%", "stored-amber")];
  const low = level("low", 1, [rule("squat", "BLOCKED", null, "red-substitute")]);
  const base = level("base", 5, [rule("squat", "CONDITIONAL", "50%", "amber-substitute")]);
  const high = level("high", 9, []);
  state.selections = [selection(base, [low, base, high])];
  const before = JSON.stringify(state);
  const red = await adaptWod(parsed, "patient-test", "RED");
  const amber = await adaptWod(parsed, "patient-test", "AMBER");
  const green = await adaptWod(parsed, "patient-test", "GREEN");
  assert.equal(red[0].state, "BLOCKED");
  assert.equal(red[0].substitutionText, "red-substitute");
  assert.equal(amber[0].state, "CONDITIONAL");
  assert.equal(amber[0].adaptedLoad, "50%");
  assert.equal(green[0].state, "OK");
  assert.equal(green[0].substitutionText, undefined);
  assert.equal(green[0].adaptedLoad, undefined);
  assert.equal(green[0].physioWarning, undefined);
  assert.equal(JSON.stringify(state), before, "no colour changes the stored amber profile");
});

test("neighbouring levels with the same substitution stay identical without skipping levels", async () => {
  reset();
  const shared = { movementId: "squat", state: "BLOCKED", loadConstraint: "15 kg", substitutionText: "V-ups lastrados; reps x2", physioWarning: null };
  const red = level("five", 5, [shared]);
  const base = level("six", 6, [{ ...shared, physioWarning: "Usa abmat" }]);
  const green = level("seven", 7, [{ ...shared, physioWarning: "Usa abmat" }]);
  const later = level("eight", 8, [rule("squat", "OK", null, "later")]);
  state.adaptations = [{ ...shared, physioWarning: "Usa abmat" }];
  state.selections = [selection(base, [red, base, green, later])];
  for (const readiness of ["RED", "AMBER", "GREEN"]) {
    const result = await adaptWod(parsed, "patient-test", readiness);
    assert.equal(result[0].state, "BLOCKED");
    assert.equal(result[0].substitutionText, shared.substitutionText);
    assert.equal(result[0].adaptedLoad, "15 kg");
    assert.equal(result[0].physioWarning, readiness === "RED" ? null : "Usa abmat");
  }
});

test("a related movement omitted from its green level cannot reintroduce amber restrictions", async () => {
  reset();
  state.adaptations = [rule("squat", "CONDITIONAL", "50%", "stored-main"), rule("sibling", "BLOCKED", null, "stored-sibling")];
  const base = level("base", 5, [rule("squat", "CONDITIONAL", "50%", "base"), rule("sibling", "BLOCKED", null, "base-sibling")]);
  const high = level("high", 9, []);
  state.selections = [selection(base, [base, high])];
  const result = await adaptWod(parsed.map(line => ({ ...line, relatedMovementIds: ["sibling"] })), "patient-test", "GREEN");
  assert.equal(result[0].state, "OK");
  assert.equal(result[0].substitutionText, undefined);
  assert.equal(result[0].adaptedLoad, undefined);
});

test("a customized blocked sibling still limits a dynamically allowed main movement", async () => {
  reset();
  state.adaptations = [rule("squat", "CONDITIONAL", "40%", "stored-main"), { ...rule("sibling", "BLOCKED", null, "custom-sibling"), isCustomized: true }];
  const base = level("base", 5, [rule("squat", "CONDITIONAL", "50%", "base")]);
  const high = level("high", 9, [rule("squat", "OK", "90%", "green"), rule("sibling", "OK", "100%", "dynamic-sibling")]);
  state.selections = [selection(base, [base, high])];
  const result = await adaptWod(parsed.map(line => ({ ...line, relatedMovementIds: ["sibling"] })), "patient-test", "GREEN");
  assert.equal(result[0].state, "BLOCKED");
  assert.equal(result[0].substitutionText, "custom-sibling");
  assert.equal(result[0].physioWarning, "custom-sibling warning");
  assert.equal(effects.writes, 0);
});

(async () => {
  for (const [name, fn] of tests) {
    await fn();
    console.log("PASS " + name);
  }
  assert.equal(effects.writes, 0);
  console.log(tests.length + " readiness checks passed; all database/network dependencies isolated, zero writes.");
})().catch(error => { console.error(error); process.exitCode = 1; });
