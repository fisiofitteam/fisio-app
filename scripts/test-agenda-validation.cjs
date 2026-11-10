// Run: node scripts/test-agenda-validation.cjs
// Executes real eligibility and route code with isolated DB/Google/notification mocks.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const RealDate = Date;
let nowISO = '2026-11-10T10:00:00Z';
class FixedDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [nowISO])); }
  static now() { return new RealDate(nowISO).getTime(); }
}
const standardShift = { dayOfWeek: 3, startTime: '17:00', endTime: '19:00', closerId: 'current-closer', slotDurationMinutes: 60 };
const state = { defaults: [standardShift], overrides: [], shifts: [], blocks: [], events: [] };
const effects = { calendarReads: 0, creates: [], deletes: [], leadWrites: [] };
const oldLead = { id: 'mock-lead', fullName: 'Mock', email: 'lead@example.test', status: 'scheduled', googleEventId: 'old-event', googleCalendarEmail: 'old@example.test', closerId: 'previous-closer' };
const inRange = (value, range) => value >= range.gte && value <= range.lte;
const prisma = {
  defaultClosingShift: { findMany: async () => state.defaults },
  weekOverride: { findFirst: async ({ where }) => state.overrides.find(x => inRange(x.weekStartDate, where.weekStartDate)) || null },
  closingShift: { findMany: async ({ where }) => state.shifts.filter(x => inRange(x.weekStartDate, where.weekStartDate)) },
  agendaBlock: { findMany: async ({ where }) => state.blocks.filter(x => inRange(x.blockedDate, where.blockedDate)) },
  lead: {
    findUnique: async () => oldLead,
    create: async ({ data }) => { effects.leadWrites.push(data); return { ...oldLead, ...data }; },
    update: async ({ data }) => { effects.leadWrites.push(data); return { ...oldLead, ...data }; },
  },
};
const calendar = {
  listEvents: async () => { effects.calendarReads++; return state.events; },
  createEventWithMeet: async input => { effects.creates.push(input); return { id: 'new-event', googleCalendarEmail: 'new@example.test' }; },
  deleteEvent: async (...args) => { effects.deletes.push(args); },
  getMeetLink: () => 'https://meet.google.com/mock-link',
};
function load(file, stubs) {
  const tested = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, {
    module: tested, exports: tested.exports,
    require: id => { if (!(id in stubs)) throw Error(`Unexpected import ${id}`); return stubs[id]; },
    Date: FixedDate, Intl, console, Map, Set, Number, Math, Promise,
  });
  return tested.exports;
}
const template = load('lib/agendaTemplate.ts', { '@/lib/prisma': { prisma } });
const slots = load('lib/agendaSlots.ts', { '@/lib/googleCalendar': calendar, '@/lib/agendaTemplate': template });
const routeStubs = {
  'next/server': { NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) } },
  '@/lib/prisma': { prisma }, '@/lib/googleCalendar': calendar, '@/lib/agendaSlots': slots,
  '@/lib/notifications': { notifySetters: async () => {}, notifyProfessional: async () => {} },
};
const book = load('app/api/agenda/book/route.ts', routeStubs);
const reschedule = load('app/api/agenda/reschedule/route.ts', routeStubs);
const start = '2026-11-11T17:00:00Z'; // 18:00 Madrid
const end = '2026-11-11T18:00:00Z';
const body = { token: 'mock-token', fullName: 'Mock', email: 'lead@example.test', phone: '123456789', country: 'ES', instagram: 'test', startISO: start, endISO: end };
const post = (route, data = body) => route.POST({ json: async () => data });
function resetEffects() {
  effects.calendarReads = 0;
  effects.creates.length = effects.deletes.length = effects.leadWrites.length = 0;
}
function assertNoWrites() {
  assert.equal(effects.creates.length, 0);
  assert.equal(effects.deletes.length, 0);
  assert.equal(effects.leadWrites.length, 0);
}
async function rejectBoth(data = body, status = 409) {
  for (const route of [book, reschedule]) {
    resetEffects();
    assert.equal((await post(route, data)).status, status);
    assertNoWrites();
  }
}
(async () => {
  let candidate = await slots.findConfiguredSlot(start, end);
  assert.equal(candidate.closerId, 'current-closer');
  assert.equal(candidate.hhmm, '18:00');
  assert(await slots.findConfiguredSlot('2026-11-11T18:00:00+01:00', '2026-11-11T19:00:00+01:00'));
  const visible = await slots.getAvailableSlots();
  assert(visible.some(x => x.startISO === new RealDate(start).toISOString()));
  assert(visible.every(x => !('closerId' in x)), 'public response keeps internal assignment private');

  // The original broken case: a whole-day block must remove the slot in UI and POST.
  state.blocks = [{ blockedDate: new RealDate('2026-11-11T12:00:00Z'), blockedStartTime: null, blockedEndTime: null }];
  assert(!(await slots.getAvailableSlots()).some(x => x.startISO.startsWith('2026-11-11')));
  await rejectBoth();
  assert.equal(effects.calendarReads, 0, 'closed slots rejected before Calendar access');

  // Partial overlap blocks an entire appointment, while touching the edge is allowed.
  state.blocks[0].blockedStartTime = '17:30'; state.blocks[0].blockedEndTime = '18:00';
  assert.equal(await slots.findConfiguredSlot('2026-11-11T16:00:00Z', '2026-11-11T17:00:00Z'), null);
  assert(await slots.findConfiguredSlot(start, end));
  state.blocks[0].blockedEndTime = '18:30';
  await rejectBoth();
  state.blocks = [];

  // A previously loaded slot must not survive a newly closed/customized week.
  state.overrides = [{ weekStartDate: new RealDate('2026-11-09T00:00:00Z'), useDefault: false }];
  assert(!(await slots.getAvailableSlots()).some(x => x.startISO.startsWith('2026-11-11')));
  await rejectBoth();
  state.shifts = [{ ...standardShift, weekStartDate: state.overrides[0].weekStartDate, startTime: '14:00', endTime: '15:00' }];
  await rejectBoth();
  assert(await slots.findConfiguredSlot('2026-11-11T13:00:00Z', '2026-11-11T14:00:00Z'));
  state.overrides = []; state.shifts = [];

  await rejectBoth({ ...body, startISO: '2026-11-12T17:00:00Z', endISO: '2026-11-12T18:00:00Z' }); // no shift
  await rejectBoth({ ...body, startISO: '2026-11-11T17:15:00Z', endISO: '2026-11-11T18:15:00Z' }); // off grid
  await rejectBoth({ ...body, endISO: '2026-11-11T17:30:00Z' }); // wrong duration
  await rejectBoth({ ...body, endISO: start }, 400);
  await rejectBoth({ ...body, endISO: '2026-11-11T16:00:00Z' }, 400);
  await rejectBoth({ ...body, startISO: 'invalid' }, 400);
  await rejectBoth({ ...body, startISO: 123 }, 400);
  await rejectBoth(null, 400);

  // Exact lower/upper start boundaries; one millisecond beyond is rejected.
  const startMs = new RealDate(start).getTime();
  assert(await slots.findConfiguredSlot(start, end, new RealDate(startMs - 24 * 3600000)));
  assert.equal(await slots.findConfiguredSlot(start, end, new RealDate(startMs - 24 * 3600000 + 1)), null);
  assert(await slots.findConfiguredSlot(start, end, new RealDate(startMs - 20 * 86400000)));
  assert.equal(await slots.findConfiguredSlot(start, end, new RealDate(startMs - 20 * 86400000 - 1)), null);

  // Range includes Monday in the last partial week (Nov10 -> Nov30).
  const weeks = await template.getShiftsForDateRange(new RealDate(nowISO), new RealDate('2026-11-30T10:00:00Z'));
  assert(weeks.has('2026-11-30'));
  state.defaults = [{ ...standardShift, dayOfWeek: 1, startTime: '11:00', endTime: '12:00' }];
  assert(await slots.findConfiguredSlot('2026-11-30T10:00:00Z', '2026-11-30T11:00:00Z'));
  // Last-day block at noon must still apply when the last allowed slot is earlier.
  state.blocks = [{ blockedDate: new RealDate('2026-11-30T12:00:00Z'), blockedStartTime: null, blockedEndTime: null }];
  assert.equal(await slots.findConfiguredSlot('2026-11-30T10:00:00Z', '2026-11-30T11:00:00Z'), null);
  state.blocks = [];

  // Preserve local daytime through the autumn DST change.
  nowISO = '2026-10-20T22:30:00Z';
  state.defaults = [{ ...standardShift, dayOfWeek: 7, startTime: '18:00', endTime: '19:00' }];
  assert(await slots.findConfiguredSlot('2026-10-25T17:00:00Z', '2026-10-25T18:00:00Z'));
  nowISO = '2026-11-10T10:00:00Z';
  state.defaults = [{ ...standardShift, slotDurationMinutes: 0 }];
  assert.equal((await slots.getConfiguredSlots()).length, 0, 'invalid duration must not loop');
  state.defaults = [standardShift];

  // Calendar conflicts are still enforced after configuration checks.
  state.events = [{ id: 'other-event', status: 'confirmed', start: { dateTime: start }, end: { dateTime: end } }];
  assert(!(await slots.getAvailableSlots()).some(x => x.startISO === new RealDate(start).toISOString()));
  await rejectBoth();
  state.events = [];
  resetEffects();
  assert.equal((await post(book)).status, 200);
  assert.equal(effects.creates.length, 1);
  assert.equal(effects.leadWrites[0].closerId, 'current-closer');
  assert.equal(effects.leadWrites[0].googleCalendarEmail, 'new@example.test');

  // Rescheduling ignores its own old event/copy and deletes from the original account.
  state.events = ['old@example.test', 'new@example.test'].map(googleCalendarEmail => ({ id: 'old-event', googleCalendarEmail, status: 'confirmed', start: { dateTime: start }, end: { dateTime: end } }));
  resetEffects();
  assert.equal((await post(reschedule)).status, 200);
  assert.equal(effects.creates.length, 1);
  assert.equal(effects.deletes[0][0], 'old-event');
  assert.equal(effects.deletes[0][1], 'old@example.test');
  assert.equal(effects.leadWrites[0].closerId, 'current-closer');
  assert.equal(effects.leadWrites[0].googleCalendarEmail, 'new@example.test');
  console.log('PASS: shared slot eligibility, full/partial blocks, stale/empty/custom shifts, grid/duration/date validation, 24h/20d bounds, final partial week, DST, Calendar conflicts, and no writes on rejected booking/rescheduling');
})().catch(error => { console.error(error); process.exitCode = 1; });
