/**
 * GET/POST /api/cron/skalex-sync
 *
 * Sincroniza las conversaciones de Skalex (setter IA de Zapp) con nuestra BD
 * mediante listados de actividad; consulta el contexto completo solo para llamadas agendadas.
 *
 * Protección: Vercel Cron envía Authorization: Bearer $CRON_SECRET.
 * Modo manual (CEO): se puede llamar con ?manual=1 y sesión.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { skalexCredentials } from "@/lib/skalex/client";
import { runActivitySync, runForwardSync } from "@/lib/skalex/sync";
import { syncScheduledCallContexts } from "@/lib/skalex/call-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Hasta cuatro primeras consultas de contexto, dos a la vez, además del listado de actividad.
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
    // 1) Forward sync: baja TODO lo que ha entrado los últimos 3 días
    //    (incluidos leads que aún no existen en nuestra BD). Esto pobla el
    //    embudo del setter sin generar resúmenes antes de la reserva.
    // 2) Actividad: captura conversaciones antiguas que se han retomado.
    const forwardStats = await runForwardSync(3);
    // Detail lookups now generate a permanent first summary. Keep general sync
    // on bulk endpoints and only request aiInsights for already-booked calls.
    const activityStats = await runActivitySync();
    const insightsStats = await syncScheduledCallContexts();
    const ms = Date.now() - t0;
    console.log("[skalex-sync] OK", { forward: forwardStats, activity: activityStats, insights: insightsStats, ms });
    return NextResponse.json({
      ok: true,
      forward: forwardStats,
      activity: activityStats,
      insights: insightsStats,
      processed: activityStats.processed,
      created: forwardStats.created + activityStats.created,
      updated: forwardStats.updated + activityStats.updated,
      durationMs: ms,
    });
  } catch (err: any) {
    console.error("[skalex-sync] FAIL", err);
    return NextResponse.json(
      { error: err?.message ?? "Sync failed" },
      { status: 500 },
    );
  }
}

export { handler as GET, handler as POST };
