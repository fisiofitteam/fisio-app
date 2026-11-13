// Run: node scripts/test-first-sale-providers.cjs
// Exercise the checkout endpoints and the actual PayPal plan builder. No credentials,
// database, HTTP, or provider SDK are loaded: only explicitly supplied imports resolve.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function isolated(file, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", "process", js)(mod, mod.exports, name => {
    assert.ok(Object.hasOwn(imports, name), "Unexpected import: " + name);
    return imports[name];
  }, { env: { NEXT_PUBLIC_BASE_URL: "https://fixture.invalid", PAYPAL_MODE: "sandbox", PAYPAL_PRODUCT_ID_SANDBOX: "fixture-product" } });
  return mod.exports;
}

const terms = isolated("lib/first-sale-terms.ts");
async function testCase({ gross, deposit, count, first, regular }, provider) {
  const sale = {
    id: "fixture-sale", paymentToken: "fixture-token", productCode: "RECUPERA_6M",
    lead: { fullName: "Fixture", email: "fixture@example.invalid" }, currency: "eur",
    grossAmountCents: gross, depositAppliedCents: deposit, amountCents: gross - deposit,
    installmentCount: count, paymentProvider: provider, status: "pending", stripeSessionId: null,
    tokenExpiresAt: new Date(Date.now() + 60_000),
  };
  const prisma = { sale: {
    findUnique: async ({ where }) => { assert.equal(where.paymentToken, sale.paymentToken); return sale; },
    updateMany: async () => ({ count: 1 }),
    update: async ({ where, data }) => { assert.equal(where.id, sale.id); Object.assign(sale, data); },
  } };
  const common = {
    "next/server": { NextResponse: { json: (body, opts) => ({ body, status: opts?.status ?? 200 }) } },
    "@/lib/prisma": { prisma },
    "@/lib/first-sale-terms": terms,
    "@/lib/stripe": { PRODUCT_CONFIG: { RECUPERA_6M: { programType: "RECUPERA", durationMonths: 6, label: "Programa" } } },
  };
  const call = route => route.POST({}, { params: { token: sale.paymentToken } });
  let schedule;
  if (provider === "stripe") {
    let sent;
    common["@/lib/stripe"].stripe = { checkout: { sessions: {
      create: async (body, options) => {
        assert.match(options.idempotencyKey, /fixture-sale/);
        sent = body;
        return { id: "cs_fixture", url: "https://checkout.invalid/" };
      },
    } } };
    const res = await call(isolated("app/api/sale/[token]/stripe/route.ts", common));
    assert.equal(res.status, 200);
    assert.equal(sent.allow_promotion_codes, false);
    assert.equal(sent.mode, count ? "subscription" : "payment");
    const lines = sent.line_items;
    assert.ok(lines.every(line => line.quantity === 1 && line.price_data.currency.toLowerCase() === "eur"));
    const initial = lines.reduce((total, line) => total + line.price_data.unit_amount, 0);
    const recurring = lines.filter(line => line.price_data.recurring?.interval === "month").reduce((total, line) => total + line.price_data.unit_amount, 0);
    schedule = [initial, ...Array((count || 1) - 1).fill(recurring)];
    const confirmation = {
      id: "cs_fixture", metadata: sent.metadata, payment_status: "paid", currency: "eur",
      mode: sent.mode, amount_total: initial,
    };
    assert.equal(terms.stripeFirstPaymentMatches(sale, confirmation), true);
    for (const wrong of [{ amount_total: initial - 1 }, { id: "other-session" }, { currency: "usd" }, { payment_status: "unpaid" }, { mode: count ? "payment" : "subscription" }]) {
      assert.equal(terms.stripeFirstPaymentMatches(sale, { ...confirmation, ...wrong }), false);
    }
  } else {
    let cycles, oneShot;
    const subscriptions = isolated("lib/paypal/subscriptions.ts", {
      "./client": { paypalFetch: async (url, options) => {
        assert.ok(options.idempotencyKey);
        if (url === "/v1/billing/plans") {
          cycles = options.body.billing_cycles;
          assert.equal(options.body.payment_preferences.setup_fee.value, "0");
          return { id: "plan_fixture", status: "ACTIVE" };
        }
        assert.equal(url, "/v1/billing/subscriptions");
        assert.equal(options.body.custom_id, sale.paymentToken);
        return { id: "sub_fixture", links: [{ rel: "approve", href: "https://checkout.invalid" }] };
      } },
    });
    const orders = isolated("lib/paypal/orders.ts", {
      "./client": { paypalFetch: async (url, options) => {
        assert.equal(url, "/v2/checkout/orders");
        const unit = options.body.purchase_units[0];
        assert.equal(unit.custom_id, sale.paymentToken);
        assert.equal(unit.amount.currency_code, "EUR");
        oneShot = Math.round(Number(unit.amount.value) * 100);
        return { id: "order_fixture", links: [{ rel: "approve", href: "https://checkout.invalid" }] };
      } },
    });
    const res = await call(isolated("app/api/sale/[token]/paypal/route.ts", {
      ...common, "@/lib/paypal/subscriptions": subscriptions, "@/lib/paypal/orders": orders,
      "@/lib/paypal/config": { paypalCredentials: () => ({}), appBaseUrl: () => "https://fixture.invalid" },
    }));
    assert.equal(res.status, 200);
    schedule = count ? cycles.flatMap((cycle, i) => {
      assert.equal(cycle.sequence, i + 1);
      assert.equal(cycle.frequency.interval_unit, "MONTH");
      assert.equal(cycle.pricing_scheme.fixed_price.currency_code, "EUR");
      return Array(cycle.total_cycles).fill(Math.round(Number(cycle.pricing_scheme.fixed_price.value) * 100));
    }) : [oneShot];
  }
  assert.deepEqual(schedule, [first, ...Array((count || 1) - 1).fill(regular)]);
  assert.equal(schedule.reduce((a, b) => a + b, deposit), gross);
}

(async () => {
  for (const provider of ["stripe", "paypal"]) {
    for (const fixture of [
      { gross: 109700, deposit: 0, count: 6, first: 18285, regular: 18283 },
      { gross: 99700, deposit: 10000, count: 6, first: 14950, regular: 14950 },
      { gross: 99700, deposit: 10000, count: null, first: 89700 },
    ]) await testCase(fixture, provider);
  }
  console.log("PASS: Stripe and PayPal, 6 first-sale schedules and deposits; Stripe confirmation checks.");
})().catch(err => { console.error(err); process.exitCode = 1; });
