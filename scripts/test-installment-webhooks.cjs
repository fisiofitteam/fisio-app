// Run with node scripts/test-installment-webhooks.cjs. SDKs, signatures,
// database and receipt writer are injected; no network or real secrets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const paidAt = Date.parse('2026-09-03T10:20:00Z') / 1000;
const baseSale = {
  id: 'sale-current', patientId: 'patient-shared', status: 'paid',
  programType: 'RECUPERA', durationMonths: 4, installmentCount: 3,
  closerId: 'closer1', createdAt: new Date('2026-08-01T00:00:00Z'),
};
const invoice = (id, extra = {}) => ({
  id, subscription: 'sub_current', amount_paid: 20000, currency: 'eur',
  status: 'paid', billing_reason: 'subscription_cycle',
  status_transitions: { paid_at: paidAt }, ...extra,
});
function setup(provider, options = {}) {
  const sale = { ...baseSale, ...options.sale };
  const renewal = {
    ...baseSale, id: 'renewal-current', renewalId: 'applied-period', createdById: 'fisio1',
    ...options.renewal,
  };
  let currentEvent;
  let failCancellation = Boolean(options.failCancellation);
  const writes = [], cancellations = [], invoiceQueries = [], ledger = new Map();
  const subscription = {
    id: 'sub_current', status: 'active',
    metadata: { productType: 'sale', saleId: sale.id, installments: '3' },
    ...options.subscription,
  };
  const client = {
    webhooks: { constructEvent: () => currentEvent },
    subscriptions: {
      retrieve: async () => subscription,
      cancel: async (id) => {
        cancellations.push(id);
        if (failCancellation) { failCancellation = false; throw Error('temporary provider failure'); }
        subscription.status = 'canceled';
      },
    },
    invoices: { list: async (query) => {
      invoiceQueries.push(query);
      assert.equal(query.subscription, 'sub_current');
      return { data: options.paidInvoices ?? [invoice('in_this_cycle')], has_more: false };
    } },
  };
  const prisma = {
    sale: { findUnique: async () => options.noSale ? null : sale },
    renewalCheckout: { findUnique: async () => renewal },
    transaction: { count: () => { throw Error('Patient-wide transaction count must never control cancellation'); } },
  };
  const receiptWriter = async (input) => {
    writes.push(input);
    const key = `${input.provider}:${input.receiptId}`;
    const exists = ledger.has(key);
    if (!exists) ledger.set(key, input);
    return { status: exists ? 'existing' : 'created', transactionId: key };
  };
  const unexpected = () => { throw Error('Unexpected activation or external dependency'); };
  const modules = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    stripe: class { constructor() { return client; } },
    '@/lib/prisma': { prisma },
    '@/lib/stripe': { isPreventionPlan: () => false },
    '@/lib/prevention': { createPreventionSubscription: unexpected, ensurePreventionRollingProgram: unexpected },
    '@/lib/auth': { getOrCreatePatientAccessPath: unexpected },
    '@/lib/email': { sendEmail: unexpected },
    '@/lib/emails/prevention': { welcomeEmail: unexpected, paymentFailedEmail: unexpected, canceledEmail: unexpected },
    '@/lib/paypal/activation': { activateSaleAsPatient: unexpected, applyRenewalCheckoutPaid: unexpected },
    '@/lib/installment-receipts': { recordInstallmentReceipt: receiptWriter },
    '@/lib/notifications': { notifyHeadSuccess: unexpected },
    '@/lib/paypal/webhook': { verifyWebhookSignature: async () => ({ ok: true }) },
    '@/lib/paypal/config': { paypalCredentials: () => ({ clientId: 'unit-test', secret: 'unit-test' }) },
  };
  const file = path.join(__dirname, `../app/api/webhooks/${provider}/route.ts`);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  process.env.STRIPE_SECRET_KEY = 'unit-test-placeholder';
  process.env.STRIPE_WEBHOOK_SECRET = 'unit-test-placeholder';
  new Function('require', 'module', 'exports', 'console', js)((name) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected real import ${name}`);
    return modules[name];
  }, loaded, loaded.exports, { log() {}, warn() {}, error() {} });
  async function deliver(resource, type) {
    currentEvent = provider === 'stripe'
      ? { id: 'evt_retry', type: type ?? 'invoice.paid', data: { object: resource } }
      : { id: 'event_retry', event_type: type ?? 'PAYMENT.SALE.COMPLETED', resource };
    return loaded.exports.POST({ text: async () => JSON.stringify(currentEvent), headers: new Headers({ 'stripe-signature': 'unit-test' }) });
  }
  return { deliver, sale, renewal, writes, ledger, cancellations, invoiceQueries };
}

const tests = [];
const test = (name, run) => tests.push([name, run]);
test('Stripe invoice before sale activation returns 500 and succeeds after activation commits', async () => {
  const s = setup('stripe', { sale: { patientId: null, status: 'pending' } });
  assert.equal((await s.deliver(invoice('in_first'))).status, 500);
  assert.equal(s.writes.length, 0);
  s.sale.patientId = 'patient-shared'; s.sale.status = 'paid';
  assert.equal((await s.deliver(invoice('in_first'))).status, 200);
  assert.equal(s.ledger.size, 1);
  assert.equal(s.writes[0].paidAt.toISOString(), '2026-09-03T10:20:00.000Z');
});
test('Stripe renewal invoice before period activation retains retry', async () => {
  const s = setup('stripe', {
    subscription: { metadata: { productType: 'renewal', renewalCheckoutId: 'renewal-current' } },
    renewal: { status: 'pending', renewalId: null },
  });
  assert.equal((await s.deliver(invoice('in_renewal'))).status, 500);
  assert.equal(s.writes.length, 0);
});
test('Other contracts and repeated webhooks cannot prematurely stop a Stripe plan', async () => {
  // The patient may have arbitrarily many old cuotas; database counting throws.
  const s = setup('stripe', { paidInvoices: [invoice('in_1'), invoice('in_2'), invoice('in_2')] });
  for (let retry = 0; retry < 4; retry++) assert.equal((await s.deliver(invoice('in_2'))).status, 200);
  assert.equal(s.ledger.size, 1);
  assert.equal(s.cancellations.length, 0);
  assert.ok(s.invoiceQueries.every((query) => query.subscription === 'sub_current'));
});
test('Stripe stops only after configured N unique paid recurring invoices', async () => {
  const s = setup('stripe', { paidInvoices: [invoice('in_1'), invoice('in_2'), invoice('in_3'), invoice('in_3')] });
  assert.equal((await s.deliver(invoice('in_3'))).status, 200);
  assert.deepEqual(s.cancellations, ['sub_current']);
  await s.deliver(invoice('in_3'));
  assert.equal(s.ledger.size, 1);
  assert.equal(s.cancellations.length, 1);
});
test('Stripe non-recurring and out-of-band invoices cannot inflate the stop counter', async () => {
  const s = setup('stripe', { paidInvoices: [
    invoice('in_1'), invoice('in_2'), invoice('in_manual', { billing_reason: 'manual' }),
    invoice('in_outside', { paid_out_of_band: true }), invoice('in_zero', { amount_paid: 0 }),
  ] });
  await s.deliver(invoice('in_2'));
  assert.equal(s.cancellations.length, 0);
});
test('Failed Stripe stop is retried without duplicating the already-recorded receipt', async () => {
  const s = setup('stripe', { failCancellation: true, paidInvoices: [invoice('in_1'), invoice('in_2'), invoice('in_3')] });
  assert.equal((await s.deliver(invoice('in_3'))).status, 500);
  assert.equal(s.ledger.size, 1);
  assert.equal((await s.deliver(invoice('in_3'))).status, 200);
  assert.equal(s.ledger.size, 1);
  assert.equal(s.cancellations.length, 2);
});
test('Stripe manually marked-paid and foreign currency events do not manufacture cash', async () => {
  const s = setup('stripe');
  assert.equal((await s.deliver(invoice('in_manual', { paid_out_of_band: true }))).status, 500);
  assert.equal((await s.deliver(invoice('in_usd', { currency: 'usd' }))).status, 500);
  assert.equal(s.writes.length, 0);
});
const paypalPayment = (id, date = '2026-09-03T10:20:00Z') => ({
  id, billing_agreement_id: 'I-SUB1', amount: { total: '200.00', currency: 'EUR' }, create_time: date,
});
test('PayPal first payment before activation returns 500 then retries into the same receipt writer', async () => {
  const s = setup('paypal', { sale: { patientId: null, status: 'pending' } });
  assert.equal((await s.deliver(paypalPayment('PAY1'))).status, 500);
  assert.equal(s.writes.length, 0);
  s.sale.patientId = 'patient-shared'; s.sale.status = 'paid';
  assert.equal((await s.deliver(paypalPayment('PAY1'))).status, 200);
  await s.deliver(paypalPayment('PAY1'));
  assert.equal(s.ledger.size, 1);
  assert.equal(s.writes[0].receiptId, 'PAY1');
});
test('PayPal later actual payment keeps its own paid date without creating future expected cuotas', async () => {
  const s = setup('paypal');
  await s.deliver(paypalPayment('PAY1', '2026-08-03T10:20:00Z'));
  await s.deliver(paypalPayment('PAY2', '2026-09-03T10:20:00Z'));
  assert.equal(s.ledger.size, 2);
  assert.equal(s.writes[0].paidAt.getUTCMonth(), 7);
  assert.equal(s.writes[1].paidAt.getUTCMonth(), 8);
  assert.ok(s.writes.every((row) => row.amountCents === 20000));
});
(async () => {
  for (const [name, run] of tests) { await run(); console.log(`PASS ${name}`); }
  console.log(`${tests.length} recurring webhook checks passed; all dependencies mocked.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
