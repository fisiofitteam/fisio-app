/**
 * GET/POST /api/cron/skalex-sync
 *
 * Sincroniza las conversaciones de Skalex (setter IA de Zapp) con nuestra BD
 * vía reverse-lookup por Lead/Patient con instagram o phone.
 *
 * Protección: Vercel Cron envía Authorization: Bearer $CRON_SECRET.
 * Modo manual (CEO): se puede llamar con ?manual=1 y sesión.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { skalexCredentials } from "@/lib/skalex/client";
import { runFullSync } from "@/lib/skalex/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// El sync tarda ~250ms por identidad + latencia Skalex. Con ~500 identidades
// serían 2-4 min. Vercel cron plan Pro admite hasta 300s (5 min).
export const maxDuration = 300;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isLocal = process.env.NODE_ENV !== "production";
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (isLocal) return true;
  // Modo manual: CEO logueado
  const url = new URL(req.url);
  if (url.searchParams.get("manual") === "1") {
    const user = await getActiveProfessional();
    if (user?.role === "ceo") return true;
  }
  return false;
}

async function handler(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!skalexCredentials()) {
    return NextResponse.json(
      { error: "Skalex no está configurado. Falta SKALEX_API_KEY en env vars." },
      { status: 503 },
    );
  }

  const t0 = Date.now();
  try {
    const stats = await runFullSync();
    const ms = Date.now() - t0;
    console.log("[skalex-sync] OK", { ...stats, ms });
    return NextResponse.json({ ok: true, ...stats, durationMs: ms });
  } catch (err: any) {
    console.error("[skalex-sync] FAIL", err);
    return NextResponse.json(
      { error: err?.message ?? "Sync failed" },
      { status: 500 },
    );
  }
}

export { handler as GET, handler as POST };
