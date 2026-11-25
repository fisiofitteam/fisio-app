import { createHash, timingSafeEqual } from "node:crypto";

export function authorizeGrok(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer ")) return false;
  const candidate = header.slice(7);
  if (candidate.length > 512) return false;
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(candidate), hash(secret));
}

export function madridDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function offsetDay(day: string, delta: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function madridMidnight(day: string): Date {
  const utc = Date.parse(day + "T00:00:00Z");
  let t = utc;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    const local = Date.parse(p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute + ":" + p.second + "Z");
    t += utc - local;
  }
  return new Date(t);
}
export function completeWindow(days: number, back = 0, now = new Date()) {
  const lastExclusive = offsetDay(madridDay(now), -back);
  return { start: madridMidnight(offsetDay(lastExclusive, -days)), end: new Date(madridMidnight(lastExclusive).getTime() - 1) };
}

export function numericFields(input: Record<string, unknown>, keys: readonly string[]) {
  return Object.fromEntries(keys.map(key => {
    const value = input[key];
    return [key, typeof value === "number" && Number.isFinite(value) ? value : null];
  }));
}
export function reportId(day: string) { return "grok-ceo-" + day; }
