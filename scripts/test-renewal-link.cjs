// Contract/deposit route tests with an isolated transactional store. No real DB or payments.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function setup({ reservation = true, claimFails = false, createFails = false } = {}) {
  const state = {
    reservations: reservation ? [{ id: 'exact-deposit', patientId: 'patient', isReservation: true,
      amountPaid: 100, reservationConsumedAt: null, decidedAt: new Date('2026-09-01T12:00:00Z') }] : [],
    checkouts: [],
  };
  const events = [];
  const clone = (value) => structuredClone(value);
  const pending = (rows, args) => rows.find((row) => row.patientId === args.where.patientId
    && row.isReservation && row.reservationConsumedAt === null && row.amountPaid > 0) ?? null;
  const prisma = {
    patient: { findUnique: async () => ({ id: 'patient' }) },
    subscriptionRenewal: { findFirst: async (args) => pending(state.reservations, args) },
    $transaction: async (callback) => {
      const draft = clone(state);
      const tx = {
        subscriptionRenewal: {
          findFirst: async (args) => { events.push('select'); return pending(draft.reservations, args); },
          updateMany: async ({ where, data }) => {
            events.push('claim');
            assert.equal(where.id, 'exact-deposit');
            assert.equal(where.patientId, 'patient');
            assert.equal(where.isReservation, true);
            assert.equal(where.reservationConsumedAt, null);
            assert.equal(where.amountPaid, 100);
            if (claimFails) return { count: 0 };
            const row = draft.reservations.find((row) => row.id === where.id && row.patientId === where.patientId
              && row.isReservation === where.isReservation && row.reservationConsumedAt === null
              && row.amountPaid === where.amountPaid);
            if (!row) return { count: 0 };
            Object.assign(row, data);
            return { count: 1 };
          },
        },
        renewalCheckout: { create: async ({ data }) => {
          events.push('create');
          if (createFails) throw Error('simulated creation failure');
          draft.checkouts.push(clone(data));
          return { paymentToken: data.paymentToken };
        } },
      };
      const result = await callback(tx);
      state.reservations = draft.reservations;
      state.checkouts = draft.checkouts;
      return result;
    },
  };
  const modules = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/prisma': { prisma },
    '@/lib/session': { getActiveProfessional: async () => ({ id: 'coach' }) },
    '@/lib/stripe': { generatePaymentToken: () => 'unchanged-opaque-token' },
  };
  const file = path.join(__dirname, '../app/api/patients/[id]/renewal-link/route.ts');
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)((name) => {
    if (!(name in modules)) throw Error('Unexpected dependency: ' + name);
    return modules[name];
  }, module, module.exports);
  const post = (extra = {}) => module.exports.POST({ json: async () => ({ programType: 'RECUPERA',
    durationMonths: 4, amountEuros: 997, paymentProvider: 'stripe', installmentCount: 3, ...extra }) }, { params: { id: 'patient' } });
  return { post, state, events };
}

(async () => {
  {
    const s = setup(); const result = await s.post();
    assert.equal(result.status, 200);
    assert.equal(result.body.amountCents, 89700);
    assert.equal(result.body.discountCents, 10000);
    const row = s.state.checkouts[0];
    assert.equal(row.amountCents, 89700);
    assert.equal(row.grossAmountCents, 99700);
    assert.equal(row.depositAppliedCents, 10000);
    assert.equal(row.reservationId, 'exact-deposit');
    assert.equal(row.installmentCount, 3);
    assert.equal(row.paymentProvider, 'stripe');
    assert.ok(s.state.reservations[0].reservationConsumedAt instanceof Date);
    assert.deepEqual(s.events, ['select', 'claim', 'create']);
  }
  {
    const s = setup({ reservation: false }); const result = await s.post();
    assert.equal(result.body.amountCents, 99700);
    assert.equal(s.state.checkouts[0].grossAmountCents, 99700);
    assert.equal(s.state.checkouts[0].depositAppliedCents, 0);
    assert.equal(s.state.checkouts[0].reservationId, null);
  }
  {
    const s = setup(); const result = await s.post({ isReservation: true, amountEuros: 100 });
    assert.equal(result.body.amountCents, 10000);
    assert.equal(s.state.checkouts[0].installmentCount, null);
    assert.equal(s.state.checkouts[0].reservationId, null);
    assert.equal(s.state.reservations[0].reservationConsumedAt, null);
    assert.deepEqual(s.events, ['create']);
  }
  {
    const s = setup({ claimFails: true }); const result = await s.post();
    assert.equal(result.status, 409);
    assert.equal(s.state.checkouts.length, 0);
    assert.equal(s.state.reservations[0].reservationConsumedAt, null);
    assert.deepEqual(s.events, ['select', 'claim']);
  }
  {
    const s = setup({ createFails: true });
    await assert.rejects(s.post(), /simulated creation failure/);
    assert.equal(s.state.checkouts.length, 0);
    assert.equal(s.state.reservations[0].reservationConsumedAt, null);
  }
  {
    const s = setup(); const result = await s.post({ amountEuros: 100 });
    assert.equal(result.status, 400);
    assert.equal(s.state.checkouts.length, 0);
    assert.equal(s.state.reservations[0].reservationConsumedAt, null);
    assert.deepEqual(s.events, ['select']);
  }
  console.log('6 renewal-link tests passed: gross/net snapshot, no deposit, reservation-only, claim race, rollback, invalid balance.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
