/**
 * Utilidades comunes para los crons: auth flexible + registro de última ejecución.
 *
 * Auth flexible: aceptamos 3 formas de autenticación, en orden de preferencia:
 *   1. Bearer $CRON_SECRET (formato oficial de Vercel Cron cuando la env var está seteada)
 *   2. User-Agent `vercel-cron/*` (Vercel Cron manda esto; fallback si CRON_SECRET no está)
 *   3. ?manual=1 con sesión CEO/head_success (para disparo desde navegador)
 *
 * Sin esta laxitud, si el CEO olvida configurar CRON_SECRET, Vercel Cron llama
 * pero recibe 403 y los reports nunca se generan — sin traza visible.
 */
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export type CronAuthResult = { ok: true; via: "secret" | "vercel-ua" | "manual" | "local" } | { ok: false };

export async function isCronAuthorized(req: NextRequest): Promise<CronAuthResult> {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const ua = req.headers.get("user-agent") ?? "";
  const isLocal = process.env.NODE_ENV !== "production";

  // 1) Bearer secret
  if (cronSecret && auth === `Bearer ${cronSecret}`) return { ok: true, via: "secret" };
  // 2) User-Agent Vercel Cron
  if (/^vercel-cron/i.test(ua)) return { ok: true, via: "vercel-ua" };
  // 3) Local dev
  if (isLocal) return { ok: true, via: "local" };
  // 4) Manual con sesión CEO/head_success
  const url = new URL(req.url);
  if (url.searchParams.get("manual") === "1") {
    const user = await getActiveProfessional();
    if (user && (user.role === "ceo" || user.role === "head_success")) return { ok: true, via: "manual" };
  }
  return { ok: false };
}

/**
 * Registra el resultado del último run del cron. Silencioso si falla — no
 * queremos que un error de logging tumbe la respuesta del cron.
 */
export async function logCronRun(
  path: string,
  result: { ok: boolean; error?: string | null; data?: any },
): Promise<void> {
  try {
    const now = new Date();
    const existing = await (prisma as any).cronRunState.findUnique({ where: { id: path } });
    if (existing) {
      await (prisma as any).cronRunState.update({
        where: { id: path },
        data: {
          lastRunAt: now,
          lastOk: result.ok,
          lastError: result.error ?? null,
          lastResultJson: result.data ? JSON.stringify(result.data).slice(0, 4000) : null,
          totalRuns: existing.totalRuns + 1,
          totalOk: existing.totalOk + (result.ok ? 1 : 0),
        },
      });
    } else {
      await (prisma as any).cronRunState.create({
        data: {
          id: path,
          lastRunAt: now,
          lastOk: result.ok,
          lastError: result.error ?? null,
          lastResultJson: result.data ? JSON.stringify(result.data).slice(0, 4000) : null,
          totalRuns: 1,
          totalOk: result.ok ? 1 : 0,
        },
      });
    }
  } catch (e) {
    console.error("[cron-utils] logCronRun failed", path, e);
  }
}
