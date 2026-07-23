/**
 * GET/POST /api/cron/patient-calls-scheduler
 *
 * Cron diario que crea ScheduledCall automáticas:
 *   - Optimización (RECUPERA/CONSOLIDA en semana 5, una vez por paciente).
 *   - Renovación (RECUPERA/CONSOLIDA/ADVANCE, 14 días antes de renovar).
 *
 * Los detalles de reglas y ventanas viven en lib/patient-calls-scheduler.
 *
 * Protección: Bearer CRON_SECRET. Permite ?test=1 en dev y ?dry=1 para
 * simular el run sin escribir (útil para diagnosticar).
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { schedulePatientCalls } from "@/lib/patient-calls-scheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isLocal = process.env.NODE_ENV !== "production";
  const isTest = req.nextUrl.searchParams.get("test") === "1";
  const isManual = req.nextUrl.searchParams.get("manual") === "1";

  if (isManual) {
    // Disparo manual desde el navegador (CEO/head_success).
    const user = await getActiveProfessional();
    if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (cronSecret && auth !== `Bearer ${cronSecret}` && !(isTest && isLocal)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await schedulePatientCalls();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: NextRequest) { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }
