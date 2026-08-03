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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel Pro permite hasta 800s. Necesitamos margen porque cuando el CEO
// dispara ?week=… procesa RECUPERA/CONSOLIDA + ADVANCE + card global,
// que son muchas llamadas a Sonnet. La paralelizacion en batches de 5
// baja el tiempo real a ~1min con 40 pacientes, pero 800s nos deja
// tranquilos frente a rate limits o llamadas lentas.
export const maxDuration = 800;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isLocal = process.env.NODE_ENV !== "production";
  const isTest = req.nextUrl.searchParams.get("test") === "1";
  const weekParam = req.nextUrl.searchParams.get("week");

  // Si viene ?week=..., permitimos que CEO/head_success lo lance a mano
  // desde el navegador logueado (mas comodo que curl con secret).
  const isAdminManual = !!weekParam;
  if (isAdminManual) {
    const user = await getActiveProfessional();
    if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (cronSecret && auth !== `Bearer ${cronSecret}` && !(isTest && isLocal)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const result = await runWeeklyReportsForWeek(monday, { force });
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }
