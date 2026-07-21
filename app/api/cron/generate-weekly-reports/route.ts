/**
 * GET /api/cron/generate-weekly-reports
 *
 * Cron semanal. Programado para dom 22:00 UTC (lun 00:00 Madrid) via
 * vercel.json. Genera un PatientWeeklyReport para cada paciente RECUPERA/
 * CONSOLIDA con >=2 sesiones completadas en la semana que acaba de
 * terminar (lunes anterior al lunes de "ahora").
 *
 * Idempotente: si ya existe report para (paciente, semana), lo regenera y
 * limpia dismissedAt para que el fisio lo vea otra vez en el feed.
 *
 * Protección: Bearer CRON_SECRET. Permite ?test=1 en dev y ?week=YYYY-MM-DD
 * para re-generar una semana concreta desde admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { runWeeklyReportsForWeek, weekStartUtc } from "@/lib/weekly-reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

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

  const result = await runWeeklyReportsForWeek(monday);
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }
