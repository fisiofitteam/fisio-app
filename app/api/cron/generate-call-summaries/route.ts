/**
 * GET/POST /api/cron/generate-call-summaries
 *
 * Cron cada 30 min. Recorre los Leads cuya videollamada ya haya ocurrido
 * (callScheduledAt < ahora - 15 min) y aún no tengan CallSummary con
 * summary o noTranscript. Para cada uno intenta bajar la transcripción de
 * Meet y generar el resumen con Claude Sonnet.
 *
 * Margen de 15 min tras el final de la llamada: Meet suele tardar 5-10 min
 * en publicar el transcript. Los que aún no tengan transcript se marcan
 * como noTranscript=true al 3er intento (ver reintentos abajo).
 *
 * Protección: Bearer CRON_SECRET. Manual desde CEO/head_success con ?manual=1.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { generateSummaryForLead } from "@/lib/call-summaries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Cada resumen: ~5-10s (bajar transcript + Sonnet). Con 20 leads pendientes
// pueden ser 100-200s. Margen: 300s (límite Vercel Pro).
export const maxDuration = 300;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isLocal = process.env.NODE_ENV !== "production";
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (isLocal) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("manual") === "1") {
    const user = await getActiveProfessional();
    if (user && (user.role === "ceo" || user.role === "head_success")) return true;
  }
  return false;
}

async function handler(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Ventana de trabajo: llamadas de los últimos 14 días cuya hora ya haya
  // pasado con margen de 15 min (para que Meet publique el transcript).
  const now = new Date();
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000);
  const fortnight = new Date(now.getTime() - 14 * 86_400_000);

  // Leads con meetingUrl (Meet) cuya llamada haya terminado, sin resumen
  // aún o pendientes de reintento.
  const leads = await prisma.lead.findMany({
    where: {
      meetingUrl: { not: null },
      callScheduledAt: { gte: fortnight, lte: cutoff },
      status: { in: ["scheduled", "won", "lost", "no_show", "cancelled"] },
    },
    select: {
      id: true,
      fullName: true,
      callSummary: {
        select: { id: true, salesSummary: true, noTranscript: true, updatedAt: true },
      },
    },
    orderBy: { callScheduledAt: "desc" },
    // Batch pequeño: cada resumen tarda 8-15s (Meet fetch + Sonnet) y el
    // límite de Vercel Pro es 300s. Con 15 no llegamos al techo aunque
    // todos tengan transcript largo. El cron se ejecuta cada 30 min, así
    // que los backlogs se drenan solos en pocas iteraciones.
    take: 15,
  });

  const targets = leads.filter((l) => {
    const s = l.callSummary;
    if (!s) return true; // nunca procesado
    if (s.salesSummary) return false; // ya listo con prompt v2
    if (s.noTranscript) {
      // Marcado como sin transcript: reintentamos si han pasado >6h desde
      // el último intento (por si Meet lo publicó tarde). Después de eso,
      // ya no volvemos a intentar.
      const hoursSince = (Date.now() - s.updatedAt.getTime()) / 3_600_000;
      const hoursSinceCall = (Date.now() - fortnight.getTime()) / 3_600_000;
      return hoursSince > 6 && hoursSinceCall < 48;
    }
    return true; // errores previos → retry
  });

  // Procesamos en paralelo (concurrencia 4) para no llegar al techo de 300s.
  // Anthropic aguanta bien 4 concurrent; Meet API también.
  const CONCURRENCY = 4;
  const results: Array<{ leadId: string; ok: boolean; reason?: string; detail?: string }> = [];
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const chunk = targets.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (l) => {
        try {
          const r = await generateSummaryForLead(l.id);
          return { leadId: l.id, ok: r.ok, reason: r.reason, detail: r.detail };
        } catch (e: any) {
          return { leadId: l.id, ok: false, reason: "exception", detail: e?.message ?? "unknown" };
        }
      }),
    );
    results.push(...chunkResults);
  }

  const ok = results.filter((r) => r.ok).length;
  const skip = results.filter((r) => r.reason === "already_processed" || r.reason === "no_transcript").length;
  const fail = results.filter((r) => !r.ok && r.reason !== "already_processed" && r.reason !== "no_transcript").length;

  return NextResponse.json({
    checkedAt: now.toISOString(),
    candidates: targets.length,
    ok,
    skipped: skip,
    failed: fail,
    results,
  });
}

export { handler as GET, handler as POST };
