// Offline route tests. Real clinical access helper; all persistence is in-memory.
import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";

let actor: any;
let selections: any[];
let adaptations: any[];
let materializations = 0;
let writes = 0;
let lastInclude: any;
const patients: Record<string, any> = {
  patient: { id: "patient", programType: "RECUPERA", assignedProfessionalId: "owner", derived: ["collaborator"] },
  other: { id: "other", programType: "CONSOLIDA", assignedProfessionalId: "other-owner", derived: [] },
  advance: { id: "advance", programType: "ADVANCE", assignedProfessionalId: "owner", derived: [] },
  prevention: { id: "prevention", programType: "PREVENTION", assignedProfessionalId: "owner", derived: [] },
};
const levels: Record<string, any> = {
  low: { id: "low", categoryId: "category", order: 0 },
  middle: { id: "middle", categoryId: "category", order: 4 },
  high: { id: "high", categoryId: "category", order: 10 },
  elsewhere: { id: "elsewhere", categoryId: "different-category", order: 0 },
};
const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) =>
  value && typeof value === "object" && "in" in value
    ? (value as { in: unknown[] }).in.includes(row[key]) : row[key] === value);
const db: any = {
  patient: {
    findUnique: async ({ where }: any) => {
      const patient = patients[where.id];
      if (!patient) return null;
      if (where.OR && !where.OR.some((condition: any) =>
        condition.assignedProfessionalId === patient.assignedProfessionalId ||
        (condition.derivations && patient.derived.includes(condition.derivations.some.toProfessionalId)))) return null;
      return patient;
    },
  },
  categoryLevel: { findUnique: async ({ where }: any) => levels[where.id] ?? null },
  patientCategoryLevel: {
    findUnique: async ({ where }: any) => {
      const selection = selections.find(row => matches(row, where.patientId_categoryId));
      return selection ? { ...selection, categoryLevel: {
        rules: [{ movementId: selection.categoryLevelId === "elsewhere" ? "different-category" : "generated" }],
      } } : null;
    },
    findMany: async ({ where, include }: any) => { lastInclude = include; return selections.filter(row => matches(row, where)); },
    findFirst: async ({ where }: any) => selections.find(row => matches(row, where)) ?? null,
    upsert: async ({ where, create, update }: any) => {
      writes++;
      const current = selections.find(row => matches(row, where.patientId_categoryId));
      if (current) { Object.assign(current, update); return current; }
      const created = { id: "selection-" + selections.length, redCategoryLevelId: null, greenCategoryLevelId: null, ...create };
      selections.push(created); return created;
    },
    updateMany: async ({ where, data }: any) => {
      const selected = selections.filter(row => matches(row, where));
      for (const row of selected) Object.assign(row, data);
      writes += selected.length;
      return { count: selected.length };
    },
    deleteMany: async ({ where }: any) => {
      const before = selections.length;
      selections = selections.filter(row => !matches(row, where));
      writes++; return { count: before - selections.length };
    },
  },
  patientAdaptation: {
    deleteMany: async ({ where }: any) => {
      assert.equal(where.isCustomized, false, "reset must preserve all manual exceptions");
      adaptations = adaptations.filter(row => !matches(row, where)); writes++;
      return { count: 1 };
    },
  },
};
const originalLoad = (Module as any)._load;
(Module as any)._load = function(id: string, ...args: any[]) {
  if (/\/lib\/prisma(?:\.ts)?$/.test(id)) return { prisma: db };
  if (/\/lib\/session(?:\.ts)?$/.test(id)) return { getActiveProfessional: async () => actor };
  if (/\/lib\/materialize-category-levels(?:\.ts)?$/.test(id)) return {
    materializePatientCategoryLevels: async (patientId: string) => {
      materializations++;
      adaptations = adaptations.filter(row => row.patientId !== patientId || row.isCustomized);
      for (const selection of selections.filter(row => row.patientId === patientId)) adaptations.push({
        patientId, movementId: selection.categoryId, isCustomized: false,
      });
    },
  };
  return originalLoad.call(this, id, ...args);
};

const makeActor = (id = "owner", role = "fisio", extraRoles: string[] = []) => ({
  id, role, extraRoles, isManager: [role, ...extraRoles].some(r => ["ceo", "head_success"].includes(r)),
});
function reset() {
  actor = makeActor();
  selections = [{
    id: "selection", patientId: "patient", categoryId: "category", categoryLevelId: "middle",
    redCategoryLevelId: null, greenCategoryLevelId: null,
  }];
  adaptations = [
    { patientId: "patient", movementId: "manual", isCustomized: true },
    { patientId: "patient", movementId: "generated", isCustomized: false },
  ];
  materializations = 0; writes = 0;
}
const request = (method: string, body?: any, search = "", origin = "https://app.invalid") =>
  new NextRequest("https://app.invalid/api/patient-category-levels" + search, {
    method, headers: { "Content-Type": "application/json", Origin: origin },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const base = (extra: any = {}) => ({ patientId: "patient", categoryId: "category", categoryLevelId: "middle", ...extra });

async function main() {
  const { GET, PUT, DELETE } = await import("../app/api/patient-category-levels/route");
  reset();
  actor = null;
  assert.equal((await GET(request("GET", undefined, "?patientId=patient"))).status, 401);
  assert.equal((await PUT(request("PUT", base()))).status, 401);
  assert.equal((await DELETE(request("DELETE", undefined, "?patientId=patient&categoryId=category"))).status, 401);
  assert.equal(writes, 0);

  actor = makeActor("owner", "closer");
  assert.equal((await GET(request("GET", undefined, "?patientId=patient"))).status, 403);
  assert.equal((await PUT(request("PUT", base()))).status, 403);
  actor = makeActor("unrelated");
  assert.equal((await PUT(request("PUT", base()))).status, 403);
  assert.equal((await DELETE(request("DELETE", undefined, "?patientId=patient&categoryId=category"))).status, 403);
  actor = makeActor("owner");
  assert.equal((await PUT(request("PUT", base({ patientId: "other" })))).status, 403);
  actor = makeActor("manager", "setter", ["head_success"]);
  assert.equal((await GET(request("GET", undefined, "?patientId=other"))).status, 200);
  actor = makeActor("collaborator", "closer", ["fisio"]);
  assert.equal((await GET(request("GET", undefined, "?patientId=patient"))).status, 200);
  assert.equal((await PUT(request("PUT", base({ readiness: "RED", categoryLevelId: "low" })))).status, 200);
  assert.equal(selections[0].redCategoryLevelId, "low");
  assert.equal(materializations, 0, "variant selection must not alter the usual plan");
  assert.equal(lastInclude.redCategoryLevel, true);
  assert.equal(lastInclude.greenCategoryLevel, true);

  reset();
  assert.equal((await PUT(request("PUT", base({ readiness: "RED", categoryLevelId: "elsewhere" })))).status, 400);
  assert.equal((await PUT(request("PUT", base({ categoryLevelId: "elsewhere" })))).status, 400);
  assert.equal((await PUT(request("PUT", base({ readiness: "BLUE" })))).status, 400);
  assert.equal((await PUT(request("PUT", base({ categoryLevelId: null })))).status, 400);
  assert.equal((await PUT(request("PUT", []))).status, 400);
  assert.equal((await PUT(request("PUT", base(), "", "https://attacker.invalid"))).status, 403);
  assert.equal(writes, 0);
  for (const patientId of ["advance", "prevention"]) {
    assert.equal((await PUT(request("PUT", base({ patientId, readiness: "RED", categoryLevelId: "low" })))).status, 400);
  }
  assert.equal((await PUT(request("PUT", base({ patientId: "advance" })))).status, 200, "legacy baseline remains supported for other programmes");

  reset();
  selections = [];
  assert.equal((await PUT(request("PUT", base({ readiness: "RED", categoryLevelId: "low" })))).status, 409);
  assert.equal(writes, 0);
  assert.equal((await PUT(request("PUT", base()))).status, 200);
  assert.equal(materializations, 1);
  assert.equal((await PUT(request("PUT", base({ readiness: "RED", categoryLevelId: "low" })))).status, 200);
  assert.equal((await PUT(request("PUT", base({ readiness: "GREEN", categoryLevelId: "high" })))).status, 200);
  assert.equal(materializations, 1);
  assert.equal((await PUT(request("PUT", base({ categoryLevelId: "high" })))).status, 200);
  assert.equal(selections[0].redCategoryLevelId, "low", "baseline must preserve red override");
  assert.equal(selections[0].greenCategoryLevelId, "high", "baseline must preserve green override");
  assert.equal(materializations, 2);
  assert.equal((await PUT(request("PUT", base({ readiness: "RED", categoryLevelId: null })))).status, 200);
  assert.equal(selections[0].redCategoryLevelId, null);
  assert.equal(selections[0].greenCategoryLevelId, "high");
  assert.equal(materializations, 2, "clearing override also leaves baseline unchanged");

  reset();
  selections.push({ id: "second", patientId: "patient", categoryId: "different-category", categoryLevelId: "elsewhere" });
  assert.equal((await DELETE(request("DELETE", undefined, "?patientId=patient&categoryId=category"))).status, 200);
  assert.equal(materializations, 1, "remaining categories must be rematerialized");
  assert(adaptations.some(row => row.movementId === "manual" && row.isCustomized));
  assert(adaptations.some(row => row.movementId === "different-category"));
  assert.equal((await DELETE(request("DELETE", undefined, "?patientId=patient&categoryId=different-category"))).status, 200);
  assert.deepEqual(adaptations, [{ patientId: "patient", movementId: "manual", isCustomized: true }]);
  reset();
  adaptations.push({ patientId: "patient", movementId: "legacy-unrelated", isCustomized: false });
  assert.equal((await DELETE(request("DELETE", undefined, "?patientId=patient&categoryId=category"))).status, 200);
  assert.equal(materializations, 0, "final category only withdraws its own rules");
  assert.deepEqual(adaptations, [
    { patientId: "patient", movementId: "manual", isCustomized: true },
    { patientId: "patient", movementId: "legacy-unrelated", isCustomized: false },
  ]);
  const writesAfterRemoval = writes;
  assert.equal((await DELETE(request("DELETE", undefined, "?patientId=patient&categoryId=category"))).status, 200);
  assert.equal(writes, writesAfterRemoval, "repeated deletion must not clear any adaptations");
  assert(adaptations.some(row => row.movementId === "legacy-unrelated"));
  console.log("PASS: clinical roles/extras, assigned/derived scope, variant programme/category guards, baseline compatibility, independent overrides, and manual/legacy-safe idempotent deletion.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { (Module as any)._load = originalLoad; });
