// Legacy refunds do patient-wide cleanup. Stop on a reserved patient's shared cash before any write or gateway call.
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript");
const { outputText } = ts.transpileModule(
  fs.readFileSync(
    path.join(__dirname, "../app/api/admin/sales/[id]/refund/route.ts"),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
);
let sale,
  firstCharge,
  period,
  writes = [],
  providers = [];
const prisma = {
  sale: {
    findUnique: async () => sale,
    findFirst: async () => firstCharge,
    update: async () => {
      writes.push("sale");
    },
  },
  subscriptionRenewal: {
    findUnique: async () => period,
    updateMany: async () => {
      writes.push("programs");
      return { count: 1 };
    },
  },
  transaction: {
    deleteMany: async () => {
      writes.push("cash");
      return { count: 1 };
    },
  },
  patient: {
    update: async () => {
      writes.push("patient");
    },
  },
};
const deps = {
  "next/server": {
    NextResponse: {
      json: (body, cfg) => ({ status: cfg?.status || 200, body }),
    },
  },
  "@/lib/prisma": { prisma },
  "@/lib/session": {
    getActiveProfessional: async () => ({ role: "ceo", id: "p" }),
  },
  "@/lib/paypal/refunds": {
    refundCapture: async () => {
      providers.push("refund");
      return { ok: true };
    },
    cancelSubscription: async () => {
      providers.push("cancel");
      return { ok: true };
    },
  },
};
const mod = { exports: {} };
new Function("require", "exports", "module", outputText)(
  (k) => {
    assert.ok(k in deps);
    return deps[k];
  },
  mod.exports,
  mod,
);
async function request(fields, newPeriod = false, hasFirst = false) {
  sale = {
    id: "s",
    status: "paid",
    patientId: "p",
    refundedAt: null,
    grossAmountCents: null,
    isReservation: false,
    paypalCaptureId: "cap",
    paypalSubscriptionId: "sub",
    ...fields,
  };
  firstCharge = hasFirst ? { id: "balance" } : null;
  period = newPeriod ? { id: "deposit:s" } : null;
  writes = [];
  providers = [];
  return mod.exports.POST(
    { json: async () => ({ reason: "unit test" }) },
    { params: { id: "s" } },
  );
}
(async () => {
  for (const [sale, period, first] of [
    [{ grossAmountCents: 119700 }, false, false],
    [{ isReservation: true }, true, false],
    [{ isReservation: true }, false, true],
  ]) {
    assert.equal((await request(sale, period, first)).status, 409);
    assert.deepEqual(providers, []);
    assert.deepEqual(writes, []);
  }
  assert.equal((await request({})).status, 200);
  assert.deepEqual(providers, ["refund", "cancel"]);
  assert.deepEqual(writes, ["sale", "patient", "cash", "programs"]);
  console.log(
    "PASS: 3 shared-file refund variants blocked before gateway or writes; ordinary legacy refund unchanged.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
