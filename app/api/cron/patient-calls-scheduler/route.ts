/**
 * GET/POST /api/cron/patient-calls-scheduler
 *
 * Cron diario que crea ScheduledCall automáticas:
 *   - Optimización (RECUPERA/CONSOLIDA en semana 5, aviso en semana 4).
 *   - Renovación (RECUPERA/CONSOLIDA/ADVANCE, 14 días antes de renovar).
 *
 * Auth flexible vía isCronAuthorized (Bearer CRON_SECRET, UA vercel-cron,
 * o ?manual=1 con sesión CEO). Registra el resultado en CronRunState para
 * poder auditar desde /api/admin/cron-state.
 */
import { NextRequest, NextResponse } from "next/server";
import { schedulePatientCalls } from "@/lib/patient-calls-scheduler";
import { isCronAuthorized, logCronRun } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const CRON_PATH = "/api/cron/patient-calls-scheduler";

async function handler(req: NextRequest) {
  const authRes = await isCronAuthorized(req);
  if (!authRes.ok) {
    await logCronRun(CRON_PATH, { ok: false, error: "unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await schedulePatientCalls();
    await logCronRun(CRON_PATH, { ok: true, data: { authVia: authRes.via, ...result } });
    return NextResponse.json({ ok: true, authVia: authRes.via, ...result });
  } catch (e: any) {
    await logCronRun(CRON_PATH, { ok: false, error: e?.message ?? "unknown" });
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}

export { handler as GET, handler as POST };
