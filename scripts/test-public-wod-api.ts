import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
const profiles = new Map<string, any>(), entries = new Map<string, any>(), rates = new Map<string, any>(), cookieJar = new Map<string, string>();
let seq = 0, actor: any = null;
const id = () => `test-record-${++seq}`;
const db: any = {
  publicWodProfile: {
    create: async ({ data }: any) => { const row = { id: id(), createdAt: new Date(), updatedAt: new Date(), lastUsedAt: new Date(), selfTestJson: null, sourceJson: "{}", marketingConsentAt: null, ...data }; profiles.set(row.id, row); return row; },
    findUnique: async ({ where }: any) => [...profiles.values()].find(row => where.id ? row.id === where.id : row.tokenHash === where.tokenHash) || null,
    update: async ({ where, data }: any) => { const row = profiles.get(where.id); if (!row) throw new Error("missing"); Object.assign(row, data); return row; },
    delete: async ({ where }: any) => { const row = profiles.get(where.id); profiles.delete(where.id); for (const e of entries.values()) if (e.profileId === where.id) entries.delete(e.id); return row; },
  },
  publicWodEntry: {
    findMany: async ({ where, take, skip = 0 }: any) => [...entries.values()].filter(e => e.profileId === where.profileId && (!where.feedbackJson || e.feedbackJson !== null) && (!where.id?.not || e.id !== where.id.not)).sort((a, b) => b.createdAt - a.createdAt).slice(skip, take ? skip + take : undefined),
    findFirst: async ({ where }: any) => [...entries.values()].find(e => e.id === where.id && e.profileId === where.profileId) || null,
    upsert: async ({ where, create }: any) => { const found = [...entries.values()].find(e => e.profileId === where.profileId_requestId.profileId && e.requestId === where.profileId_requestId.requestId); if (found) return found; const row = { id: id(), createdAt: new Date(), updatedAt: new Date(), completedAt: null, feedbackJson: null, ...create }; entries.set(row.id, row); return row; },
    update: async ({ where, data }: any) => { const row = entries.get(where.id); Object.assign(row, data); return row; },
  },
  publicWodRateLimit: { upsert: async ({ where, create }: any) => { const row = rates.get(where.key); if (row) { row.count++; return row; } rates.set(where.key, create); return create; }, deleteMany: async () => ({ count: 0 }) },
};
const original = (Module as any)._load;
(Module as any)._load = function (name: string, ...args: any[]) {
  if (name === "next/headers") return { cookies: () => ({ get: (key: string) => cookieJar.has(key) ? { value: cookieJar.get(key) } : undefined, set: (key: string, value: string) => cookieJar.set(key, value) }) };
  if (name.endsWith("/lib/prisma") || name.endsWith("/lib/prisma.ts")) return { prisma: db };
  if (name.endsWith("/lib/auth") || name.endsWith("/lib/auth.ts")) return { getActiveProfessional: async () => actor, hasAnyRole: (a: any, roles: string[]) => [a.role, ...(a.extraRoles || [])].some(r => roles.includes(r)), hasRole: (a: any, role: string) => a.role === role || a.extraRoles?.includes(role) };
  return original.call(this, name, ...args);
};
const origin = "https://app.fisiofitteam.com";
function req(route: string, body?: unknown, method = "POST", requestOrigin = origin) { return new NextRequest(`${origin}/api/public-wod/${route}`, { method, headers: { Origin: requestOrigin, "Content-Type": "application/json", "x-real-ip": "127.0.0.1" }, body: method === "GET" ? undefined : JSON.stringify(body) }); }
async function main() {
  const profileRoute = await import("../app/api/public-wod/profile/route");
  const adaptRoute = await import("../app/api/public-wod/adapt/route");
  const feedbackRoute = await import("../app/api/public-wod/feedback/route");
  const sessionRoute = await import("../app/api/public-wod/session/route");
  const contactRoute = await import("../app/api/public-wod/contact/route");
  const staffRoute = await import("../app/api/wod-leads/route");
  const profile = { adult: true, side: "right", duration: "3m12m", onset: "gradual", timing: ["during"], diagnosis: "", restrictions: "none", restrictionNotes: "", trainingDays: 3, experience: "over3", equipment: ["rings", "box"], goal: "Volver a entrenar", tried: "", intent: "adapt", groups: { overhead: "comfortable", push: "comfortable", pull: "comfortable", support: "comfortable" }, safetyFlags: [], safetyReviewed: true };
  const registration = { profile, name: "Prueba A", phone: "+34600111222", healthConsent: true, marketingConsent: false };
  assert.equal((await profileRoute.GET(req("profile", undefined, "GET"))).status, 401);
  assert.equal((await profileRoute.POST(req("profile", registration, "POST", "https://attacker.test"))).status, 403);
  assert.equal(profiles.size, 0);
  const created = await profileRoute.POST(req("profile", registration)); assert.equal(created.status, 201);
  const first = await created.json(); const keyA = first.recoveryKey;
  assert.equal(profiles.get(first.profile.id).tokenHash, createHash("sha256").update(keyA).digest("hex"));
  assert(!JSON.stringify(first.profile).includes(keyA)); assert.equal(first.profile.marketingConsent, false);
  const body = { rawText: "10 thrusters 30 kg\n8 pull-ups", readiness: "AMBER", painBefore: 1, safetyToday: "none", confirmedText: true, confirmedAlternatives: [], requestId: "00000000-0000-4000-8000-000000000001" };
  const adapted = await adaptRoute.POST(req("adapt", body)); assert.equal(adapted.status, 200); const entry = await adapted.json(); assert.equal(entries.size, 1);
  assert.match(adapted.headers.get("cache-control")!, /no-store/);
  assert.equal((await adaptRoute.POST(req("adapt", body))).status, 200); assert.equal(entries.size, 1, "retry must not duplicate");
  const second = await (await profileRoute.POST(req("profile", { ...registration, name: "Prueba B" }))).json();
  assert.notEqual(first.profile.id, second.profile.id, "unverified identical phone must not merge profiles");
  assert.equal((await profileRoute.GET(req("profile", undefined, "GET"))).status, 200);
  assert.equal((await (await profileRoute.GET(req("profile", undefined, "GET"))).json()).entries.length, 0);
  const feedback = { entryId: entry.id, response: "same", nextDay: "pending", effort: 5, painAfter: 2, painNextDay: null, notes: "", exercises: entry.result.lines.map((l: any) => ({ key: l.key, performed: "as-proposed", hurt: false, actual: "" })) };
  assert.equal((await feedbackRoute.POST(req("feedback", feedback))).status, 404);
  assert.equal((await adaptRoute.POST(req("adapt", { ...body, entryId: entry.id }))).status, 404);
  assert.equal((await sessionRoute.POST(req("session", { action: "restore", key: keyA }))).status, 200);
  assert.equal((await feedbackRoute.POST(req("feedback", { ...feedback, exercises: [{ ...feedback.exercises[0], key: "injected" }] }))).status, 400);
  assert.equal((await feedbackRoute.POST(req("feedback", { ...feedback, nextDay: "same", painNextDay: 1 }))).status, 400);
  const saved = await feedbackRoute.POST(req("feedback", feedback)); assert.equal(saved.status, 200); assert(entries.get(entry.id).completedAt);
  assert.equal((await adaptRoute.POST(req("adapt", { ...body, entryId: entry.id }))).status, 409);
  entries.get(entry.id).completedAt = new Date(Date.now() - 19 * 3600000);
  assert.equal((await feedbackRoute.POST(req("feedback", { ...feedback, nextDay: "same", painNextDay: 1 }))).status, 200);
  assert.equal((await contactRoute.POST(req("contact", { kind: "case" }))).status, 200); assert(profiles.get(first.profile.id).helpRequestedAt);
  assert.equal(profiles.get(first.profile.id).marketingConsentAt, null, "requesting help must not opt into marketing");
  assert.equal((await staffRoute.GET(new NextRequest(`${origin}/api/wod-leads?id=${first.profile.id}`))).status, 401);
  actor = { id: "setter", role: "setter", extraRoles: [] };
  assert.equal((await staffRoute.GET(new NextRequest(`${origin}/api/wod-leads?id=${first.profile.id}`))).status, 403);
  assert.equal((await staffRoute.DELETE(new NextRequest(`${origin}/api/wod-leads`, { method: "DELETE", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ id: first.profile.id }) }))).status, 403);
  assert.equal((await profileRoute.DELETE(req("profile", {}, "DELETE"))).status, 200); assert.equal(entries.size, 0); assert.equal(profiles.size, 1);
  assert.equal((await sessionRoute.POST(req("session", { action: "restore", key: keyA }))).status, 401);
  console.log("PASS: consent, CSRF, hashed sessions, same-phone isolation, history/feedback ownership, idempotency, completed-at follow-up gating, clinical/commercial permissions, deletion and revoked recovery links.");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { (Module as any)._load = original; });
