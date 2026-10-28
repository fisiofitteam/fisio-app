import assert from "node:assert/strict";
import { canCoverClosingShift } from "../lib/closing-shift-roles";
assert.equal(canCoverClosingShift({ role: "fisio", extraRoles: ["closer"] }), true);
assert.equal(canCoverClosingShift({ role: "head_success", extraRoles: ["setter"] }), true);
for (const role of ["ceo", "closer", "setter"]) assert.equal(canCoverClosingShift({ role }), true);
for (const role of ["fisio", "head_success"]) assert.equal(canCoverClosingShift({ role, extraRoles: [] }), false);
assert.equal(canCoverClosingShift({ role: "fisio", extraRoles: null }), false);
console.log("PASS primary and secondary sales roles; non-sales roles remain excluded");
