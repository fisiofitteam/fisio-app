/**
 * GET /api/cron/generate-weekly-reports
 *
 * Cron semanal. Programado para dos ventanas en vercel.json:
 *  - dom 22:00 UTC (lun 00:00 Madrid): disparo principal
 *  - lun 06:00 UTC (~7-8am Madrid según DST): red de seguridad por si
 *    Vercel se saltase el disparo dominical
 *
 * Genera un PatientWeeklyReport para cada paciente RECUPERA/CONSOLIDA con
 * >=2 sesiones completadas en la semana que acaba de terminar (lunes
 * anterior al lunes de "ahora").
 *
 * Idempotencia: si ya existe report para (paciente, semana), SALTAMOS
 * (no re-notificamos). Se puede forzar la regeneración con `?force=1`.
 *
 * Protección: Bearer CRON_SECRET. Permite ?test=1 en dev, ?week=YYYY-MM-DD
 * para re-generar una semana concreta desde admin, y ?force=1 para pasar
 * por encima de la protección de idempotencia.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { runWeeklyReportsForWeek, weekStartUtc } from "@/lib/weekly-reports";
import { isCronAuthorized, logCronRun } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel Pro corta a 300s aunque declaremos más. Antes teníamos 800 →
// Vercel lo respetaba silenciosamente al máximo real y el cron petaba con
// 504 sin generar todos los reports. Con CONCURRENCY=10 en el generador,
// 40 pacientes RECUPERA/CONSOLIDA + 10 ADVANCE + card global tardan
// ~60-90s reales, así que 300s deja margen amplio.
export const maxDuration = 300;

const CRON_PATH = "/api/cron/generate-weekly-reports";

async function handler(req: NextRequest) {
  const weekParam = req.nextUrl.searchParams.get("week");
  // Si viene ?week=... permitimos que CEO/head_success lo lance a mano
  // desde el navegador logueado (más cómodo que curl con secret).
  const isAdminManual = !!weekParam;
  let authVia: string = "manual";
  if (isAdminManual) {
    const user = await getActiveProfessional();
    if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    const authRes = await isCronAuthorized(req);
    if (!authRes.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    authVia = authRes.via;
  }

  // Semana a procesar: si viene ?week=YYYY-MM-DD, esa; si no, la semana
  // anterior a la actual (la que acaba de terminar). weekStartUtc normaliza
  // cualquier fecha al lunes UTC.
  let monday: Date;
  if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    monday = weekStartUtc(new Date(weekParam + "T12:00:00.000Z"));
  } else {
    const currentMonday = weekStartUtc(new Date());
    monday = new Date(currentMonday);
    monday.setUTCDate(monday.getUTCDate() - 7);
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    const result = await runWeeklyReportsForWeek(monday, { force });
    await logCronRun(CRON_PATH, { ok: true, data: { authVia, ...result, mondayIso: monday.toISOString() } });
    return NextResponse.json({ ...result, authVia });
  } catch (err: any) {
    await logCronRun(CRON_PATH, { ok: false, error: err?.message ?? String(err), data: { authVia, monday: monday.toISOString() } });
    throw err;
  }
}

export async function GET(req: NextRequest) { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }
