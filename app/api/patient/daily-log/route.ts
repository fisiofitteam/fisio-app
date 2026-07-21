import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";
import { todayForPatient, startOfDayForPatient } from "@/lib/patient-dates";
import { runMetricAlertDetector } from "@/lib/metric-alerts";

// POST /api/patient/daily-log — upsert del log de HOY del paciente activo.
// body: { fatigue, rpe, sleep } — cada uno entero 0..10.
export async function POST(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const fatigue = clamp(b?.fatigue);
  const rpe = clamp(b?.rpe);
  const sleep = clamp(b?.sleep);
  if (fatigue === null || rpe === null || sleep === null) {
    return NextResponse.json({ error: "Faltan valores o están fuera de rango (0-10)" }, { status: 400 });
  }

  // "Hoy" según la TZ del paciente — un atleta en Colombia que registra
  // a las 23:30 hora local (04:30 UTC del día siguiente) guarda con la
  // fecha calendario de Colombia, no la de Madrid.
  //
  // El cliente puede pasar `recordedDate: "YYYY-MM-DD"` para rellenar el
  // log de un día pasado (backfill). Solo aceptamos fechas dentro de los
  // últimos 14 días y NUNCA futuras — así el histórico no queda expuesto
  // a manipulación arbitraria.
  const full = await prisma.patient.findUnique({
    where: { id: patient.id },
    select: { timezone: true },
  });
  const today = todayForPatient(full?.timezone ?? null);
  let recordedDate = today;
  const rawRec = typeof b?.recordedDate === "string" ? b.recordedDate.trim() : "";
  if (rawRec) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawRec)) {
      return NextResponse.json({ error: "recordedDate inválido (YYYY-MM-DD)" }, { status: 400 });
    }
    const parsed = startOfDayForPatient(full?.timezone ?? null, new Date(rawRec + "T12:00:00.000Z"));
    const diffDays = Math.round((today.getTime() - parsed.getTime()) / 86400000);
    if (diffDays < 0) {
      return NextResponse.json({ error: "No puedes registrar fechas futuras" }, { status: 400 });
    }
    if (diffDays > 14) {
      return NextResponse.json({ error: "Solo puedes rellenar los últimos 14 días" }, { status: 400 });
    }
    recordedDate = parsed;
  }
  const saved = await prisma.patientDailyLog.upsert({
    where: { patientId_recordedDate: { patientId: patient.id, recordedDate } },
    create: { patientId: patient.id, recordedDate, fatigue, rpe, sleep },
    update: { fatigue, rpe, sleep },
  });

  // Detector de alertas por metricas — corre sync pero silencioso: si por
  // lo que sea peta, no rompe el guardado del paciente. Devuelve void.
  await runMetricAlertDetector({
    id: saved.id,
    patientId: patient.id,
    fatigue: saved.fatigue,
    rpe: saved.rpe,
    sleep: saved.sleep,
    recordedDate: saved.recordedDate,
  });

  return NextResponse.json(saved);
}

// GET /api/patient/daily-log — devuelve el histórico del paciente activo
// (últimas 60 entradas), más el log de HOY si existe.
export async function GET() {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const full = await prisma.patient.findUnique({
    where: { id: patient.id },
    select: { timezone: true },
  });
  const entries = await prisma.patientDailyLog.findMany({
    where: { patientId: patient.id },
    orderBy: { recordedDate: "desc" },
    take: 60,
  });
  const today = todayForPatient(full?.timezone ?? null);
  const todayEntry = entries.find((e) => e.recordedDate.getTime() === today.getTime()) ?? null;
  return NextResponse.json({ entries, todayEntry, todayIso: today.toISOString() });
}

function clamp(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < 0 || i > 10) return null;
  return i;
}
