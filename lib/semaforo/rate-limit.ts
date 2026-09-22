/**
 * Rate limit muy sencillo en memoria por IP para los endpoints del
 * Semáforo. No usamos Redis porque el proyecto no lo tiene y el
 * volumen esperado (leads viniendo de reels) es bajo. Es "best effort":
 * si el proceso serverless muere, el contador se resetea — asumible
 * para el nivel de abuso que esperamos.
 *
 * Uso:
 *   const ok = await rateLimit(ip, "create", { limit: 5, windowMs: 60_000 });
 *   if (!ok) return NextResponse.json({ error: "Slow down" }, { status: 429 });
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

export function rateLimit(ip: string, key: string, opts: RateLimitOptions): boolean {
  const now = Date.now();
  const k = `${key}:${ip}`;
  const b = buckets.get(k);
  if (!b || now > b.resetAt) {
    buckets.set(k, { count: 1, resetAt: now + opts.windowMs });
    return true;
  }
  if (b.count >= opts.limit) return false;
  b.count++;
  return true;
}

/** Limpia buckets caducados de vez en cuando para no crecer sin fin.
 *  Se llama oportunistamente desde los endpoints (1% de probabilidad). */
export function maybeCleanupBuckets(): void {
  if (Math.random() > 0.01) return;
  const now = Date.now();
  for (const [k, b] of buckets.entries()) {
    if (now > b.resetAt) buckets.delete(k);
  }
}

/** Extrae la IP de una Request de Next — usa headers de proxy si están. */
export function getClientIp(req: Request): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
