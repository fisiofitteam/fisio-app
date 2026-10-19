// Run: node scripts/test-transactions.cjs. No real database or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const marker = '[ff-receipt:v1 provider=stripe receipt=in_one contract=sale:sale1 subscription=sub1]';
const original = { id: 'manual1', type: 'income_new', amount: 200, description: 'Ingreso manual', patientId: 'patient1' };

function setup(initial = [original], options = {}) {
  const rows = new Map(initial.map((row) => [row.id, structuredClone(row)]));
  let writes = 0;
  let reads = 0;
  function mutable(where) {
    const row = rows.get(where.id);
    if (!row) return false;
    if (!where.OR) return true;
    return where.OR.some((condition) => condition.description === null
      ? row.description == null
      : row.description != null && !row.description.includes(condition.description.not.contains));
  }
  function beforeMutation(id) {
    if (options.adoptBeforeMutation) rows.get(id).description += ` ${marker}`;
    if (options.databaseFailure) throw Object.assign(Error('Database unavailable'), { code: 'P1001' });
  }
  const prisma = { transaction: {
    findUnique: async ({ where }) => { reads++; return structuredClone(rows.get(where.id) ?? null); },
    update: async ({ where, data }) => {
      beforeMutation(where.id);
      if (!mutable(where)) throw Object.assign(Error('No matching row'), { code: 'P2025' });
      writes++;
      Object.assign(rows.get(where.id), data);
      return rows.get(where.id);
    },
    delete: async ({ where }) => {
      beforeMutation(where.id);
      if (!mutable(where)) throw Object.assign(Error('No matching row'), { code: 'P2025' });
      writes++; rows.delete(where.id);
    },
    create: async ({ data }) => { writes++; rows.set('created', { id: 'created', ...data }); return rows.get('created'); },
  } };
  const file = path.join(__dirname, '../app/api/transactions/route.ts');
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)((name) => {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
    if (name === '@/lib/prisma') return { prisma };
    throw Error(`Unexpected real dependency: ${name}`);
  }, mod, mod.exports);
  const patch = (body) => mod.exports.PATCH({ json: async () => body });
  const remove = (id) => mod.exports.DELETE({ nextUrl: new URL(`https://example.test/api/transactions${id ? `?id=${encodeURIComponent(id)}` : ''}`) });
  return { patch, remove, post: (body) => mod.exports.POST({ json: async () => body }), rows, writes: () => writes, reads: () => reads };
}

const tests = [];
const test = (name, run) => tests.push([name, run]);
for (const [label, row] of [
  ['deterministic provider receipt', { ...original, id: 'receipt:stripe:invoice:in_one', description: 'Cuota' }],
  ['adopted receipt with random original ID', { ...original, description: `Cuota antigua ${marker}` }],
]) {
  test(`PATCH cannot change ${label}`, async () => {
    const s = setup([row]);
    assert.equal((await s.patch({ id: row.id, amount: 1, description: 'remove identity' })).status, 409);
    assert.deepEqual(s.rows.get(row.id), row);
    assert.equal(s.writes(), 0);
  });
  test(`DELETE cannot remove ${label}`, async () => {
    const s = setup([row]);
    assert.equal((await s.remove(row.id)).status, 409);
    assert.deepEqual(s.rows.get(row.id), row);
    assert.equal(s.writes(), 0);
  });
}
test('Manual PATCH retains field conversion and clearing behavior', async () => {
  const s = setup();
  const r = await s.patch({ id: 'manual1', amount: '300.25', description: '', category: '', patientId: '', professionalId: '' });
  assert.equal(r.status, 200); assert.equal(s.writes(), 1); assert.equal(s.reads(), 1);
  assert.equal(r.body.amount, 300.25); assert.equal(r.body.description, null);
  assert.equal(r.body.patientId, null); assert.equal(r.body.professionalId, null); assert.equal(r.body.category, null);
});
test('Manual rows with null descriptions remain editable and deletable', async () => {
  const s = setup([{ ...original, description: null }]);
  assert.equal((await s.patch({ id: 'manual1', amount: '10' })).status, 200);
  assert.equal((await s.remove('manual1')).status, 200);
  assert.equal(s.rows.size, 0);
});
test('Missing transactions return 404 without mutation', async () => {
  const s = setup([]);
  assert.equal((await s.patch({ id: 'missing', amount: 1 })).status, 404);
  assert.equal((await s.remove('missing')).status, 404); assert.equal(s.writes(), 0);
});
test('Missing IDs retain 400 validation', async () => {
  const s = setup();
  assert.equal((await s.patch({ amount: 1 })).status, 400);
  assert.equal((await s.remove()).status, 400); assert.equal(s.writes(), 0);
});
test('Concurrent receipt adoption blocks PATCH atomically, preserving amount and marker', async () => {
  const s = setup([original], { adoptBeforeMutation: true });
  assert.equal((await s.patch({ id: 'manual1', amount: 1, description: 'erase marker' })).status, 409);
  assert.equal(s.rows.get('manual1').amount, 200);
  assert.ok(s.rows.get('manual1').description.includes(marker)); assert.equal(s.writes(), 0);
});
test('Concurrent receipt adoption blocks DELETE atomically', async () => {
  const s = setup([original], { adoptBeforeMutation: true });
  assert.equal((await s.remove('manual1')).status, 409);
  assert.ok(s.rows.get('manual1').description.includes(marker)); assert.equal(s.writes(), 0);
});
test('Manual creation remains unchanged', async () => {
  const s = setup([]);
  const r = await s.post({ type: 'expense', category: 'software', amount: '42.50', description: 'Software', occurredAt: '2026-10-19', professionalId: '', patientId: '' });
  assert.equal(r.status, 200); assert.equal(r.body.amount, 42.5);
  assert.equal(r.body.professionalId, null); assert.equal(r.body.patientId, null);
});
test('Database failures are not disguised as receipt conflicts', async () => {
  const s = setup([original], { databaseFailure: true });
  await assert.rejects(() => s.patch({ id: 'manual1', amount: 1 }), { code: 'P1001' });
  await assert.rejects(() => s.remove('manual1'), { code: 'P1001' });
});
(async () => {
  for (const [name, run] of tests) { await run(); console.log(`PASS ${name}`); }
  console.log(`${tests.length} transaction API checks passed; dependencies mocked.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
