/**
 * GET/POST /api/cron/generate-call-summaries
 *
 * Cron cada 30 min. Procesa dos fuentes en la misma corrida:
 *   1) Leads con Meet cuya llamada de venta ya ocurrió → genera CallSummary
 *      vinculado a leadId con secciones sales + clinical + coaching.
 *   2) PatientCalls con Meet cuya llamada de seguimiento ya ocurrió → genera
 *      CallSummary vinculado a patientCallId con secciones clinical + coaching
 *      (+ renewalContext si type=renewal).
 *
 * Margen de 15 min tras el final de la llamada: Meet suele tardar 5-10 min
 * en publicar el transcript. Los que aún no tengan transcript se marcan
 * como noTranscript=true al 3er intento (ver reintentos abajo).
 *
 * Protección: Bearer CRON_SECRET. Manual desde CEO/head_success con ?manual=1.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateSummaryForLead } from "@/lib/call-summaries";
import { generateSummaryForPatientCall } from "@/lib/patient-call-summaries";
import { isCronAuthorized, logCronRun } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Cada resumen: ~5-10s (bajar transcript + Sonnet). Con 20 leads pendientes
// pueden ser 100-200s. Margen: 300s (límite Vercel Pro).
export const maxDuration = 300;

const CRON_PATH = "/api/cron/generate-call-summaries";

async function handler(req: NextRequest) {
  const authRes = await isCronAuthorized(req);
  if (!authRes.ok) {
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
      status: true,
      callSummary: {
        select: { id: true, salesSummary: true, coachingSummary: true, outcome: true, noTranscript: true, updatedAt: true },
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
    if (s.salesSummary) {
      // El status del lead manda: si es won/lost pero el summary no lo
      // refleja (outcome distinto o falta coaching), reprocesamos.
      const leadIsConclusive = l.status === "won" || l.status === "lost";
      if (leadIsConclusive) {
        if (s.outcome !== l.status) return true;   // desincronizado
        if (!s.coachingSummary) return true;       // falta coaching
      }
      return false; // ya listo
    }
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
  const leadResults: Array<{ leadId: string; ok: boolean; reason?: string; detail?: string }> = [];
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
    leadResults.push(...chunkResults);
  }

  // === PatientCalls (llamadas de seguimiento fisio↔paciente) ===
  // Mismo criterio: la hora programada ya pasó con margen de 15 min y no
  // hay resumen listo. Usamos scheduledAt como referencia de "cuándo ocurrió".
  const patientCalls = await prisma.patientCall.findMany({
    where: {
      meetingUrl: { not: null },
      scheduledAt: { gte: fortnight, lte: cutoff },
      status: { in: ["scheduled", "completed"] },
    },
    select: {
      id: true,
      status: true,
      callSummary: {
        select: { id: true, clinicalSummary: true, noTranscript: true, updatedAt: true },
      },
    },
    orderBy: { scheduledAt: "desc" },
    take: 15,
  });
  const patientTargets = patientCalls.filter((c) => {
    const s = c.callSummary;
    if (!s) return true;
    if (s.clinicalSummary) return false; // ya listo
    if (s.noTranscript) {
      const hoursSince = (Date.now() - s.updatedAt.getTime()) / 3_600_000;
      return hoursSince > 6;
    }
    return true; // errores previos → retry
  });
  const patientResults: Array<{ patientCallId: string; ok: boolean; reason?: string; detail?: string }> = [];
  for (let i = 0; i < patientTargets.length; i += CONCURRENCY) {
    const chunk = patientTargets.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (c) => {
        try {
          const r = await generateSummaryForPatientCall(c.id);
          return { patientCallId: c.id, ok: r.ok, reason: r.reason, detail: r.detail };
        } catch (e: any) {
          return { patientCallId: c.id, ok: false, reason: "exception", detail: e?.message ?? "unknown" };
        }
      }),
    );
    patientResults.push(...chunkResults);
  }

  function tally(rs: Array<{ ok: boolean; reason?: string }>) {
    const ok = rs.filter((r) => r.ok).length;
    const skip = rs.filter((r) => r.reason === "already_processed" || r.reason === "no_transcript").length;
    const fail = rs.filter((r) => !r.ok && r.reason !== "already_processed" && r.reason !== "no_transcript").length;
    return { ok, skip, fail };
  }
  const leadStats = tally(leadResults);
  const patientStats = tally(patientResults);

  await logCronRun(CRON_PATH, {
    ok: true,
    data: {
      authVia: authRes.via,
      lead: { candidates: targets.length, ...leadStats },
      patient: { candidates: patientTargets.length, ...patientStats },
    },
  });

  return NextResponse.json({
    checkedAt: now.toISOString(),
    authVia: authRes.via,
    lead: {
      candidates: targets.length,
      ok: leadStats.ok,
      skipped: leadStats.skip,
      failed: leadStats.fail,
      results: leadResults,
    },
    patient: {
      candidates: patientTargets.length,
      ok: patientStats.ok,
      skipped: patientStats.skip,
      failed: patientStats.fail,
      results: patientResults,
    },
  });
}

export { handler as GET, handler as POST };
