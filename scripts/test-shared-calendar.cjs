// Isolated regression: uses real module source with mocked database and HTTP.
// Run with: node scripts/test-shared-calendar.cjs
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const expires = new Date(Date.now() + 3600000);
const current = { id: 'current', googleEmail: 'fisiofitteam@fisiofitteam.com', accessTokenEnc: 'new-token', tokenExpiresAt: expires };
const old = { id: 'old', googleEmail: 'videoconsultas@fisiofitteam.com', accessTokenEnc: 'old-token', tokenExpiresAt: expires };
const personal = { id: 'personal', googleEmail: 'coach@example.test', accessTokenEnc: 'personal-token', tokenExpiresAt: expires };
const prisma = {
  googleCalendarConnection: {
    findUnique: async ({ where }) => where.professionalId ? personal : where.googleEmail === old.googleEmail ? old : current,
    update: async () => {},
  },
  lead: { findMany: async () => [{ googleCalendarEmail: old.googleEmail }, { googleCalendarEmail: current.googleEmail }] },
};
const requests = [];
let mode = 'list';
const fetchMock = async (url, opts) => {
  requests.push({ url, opts });
  const parsed = new URL(url);
  const email = decodeURIComponent(parsed.pathname.split('/')[4]);
  if (mode === 'list') return {
    ok: true,
    json: async () => ({
      items: [{ id: email === old.googleEmail ? 'old-event' : 'new-event', status: 'confirmed' }],
      ...(!parsed.searchParams.has('pageToken') ? { nextPageToken: 'page2' } : {}),
    }),
  };
  if (mode === 'create') return { ok: true, json: async () => ({ id: 'created', status: 'confirmed' }) };
  return { ok: true, status: 204 };
};
const testedModule = { exports: {} };
const stubs = {
  '@/lib/prisma': { prisma },
  '@/lib/google-connection': { getOrganizationalConnection: async () => current },
  '@/lib/encryption': { encrypt: x => x, decrypt: x => x },
  '@/lib/googleOAuth': { refreshAccessToken: async () => { throw Error('Unexpected refresh'); } },
};
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/googleCalendar.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(source, {
  module: testedModule, exports: testedModule.exports,
  require: id => { if (!stubs[id]) throw Error(id); return stubs[id]; },
  fetch: fetchMock, URLSearchParams, Date, console, Map, Set, Math, encodeURIComponent,
});
(async () => {
  const c = testedModule.exports;
  assert.equal(await c.getValidAccessToken(), 'new-token');
  assert.equal(await c.getValidAccessToken({ professionalId: 'coach' }), 'personal-token');
  assert.equal(await c.getValidAccessToken({ googleEmail: old.googleEmail }), 'old-token');
  const events = await c.listEvents('2026-11-05T00:00:00Z', '2026-11-10T00:00:00Z');
  assert.equal(events.length, 2);
  assert.equal(requests.length, 4);
  assert(requests.some(r => r.opts.headers.Authorization === 'Bearer old-token'));
  assert(events.some(e => e.googleCalendarEmail === old.googleEmail));
  assert(events.some(e => e.googleCalendarEmail === current.googleEmail));
  requests.length = 0;
  mode = 'create';
  const created = await c.createEventWithMeet({ title: 'Test', startISO: '2026-11-05T00:00:00Z', endISO: '2026-11-05T01:00:00Z', attendeeEmail: 'lead@example.test' });
  assert.equal(created.googleCalendarEmail, current.googleEmail);
  assert.equal(requests[0].opts.headers.Authorization, 'Bearer new-token');
  const body = JSON.parse(requests[0].opts.body);
  assert(!body.attendees.some(a => a.email === current.googleEmail));
  assert(body.attendees.some(a => a.email === 'lead@example.test'));
  requests.length = 0;
  mode = 'delete';
  await c.deleteEvent('old-event', old.googleEmail);
  assert(requests[0].url.includes(encodeURIComponent(old.googleEmail)));
  assert.equal(requests[0].opts.headers.Authorization, 'Bearer old-token');
  console.log('PASS: shared/personal/legacy routing, availability pagination/dedup, organizer metadata, attendees, legacy deletion');
})().catch(e => { console.error(e); process.exitCode = 1; });
