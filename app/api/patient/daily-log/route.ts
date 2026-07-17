import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";
import { todayForPatient } from "@/lib/patient-dates";

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
  const full = await prisma.patient.findUnique({
    where: { id: patient.id },
    select: { timezone: true },
  });
  const recordedDate = todayForPatient(full?.timezone ?? null);
  const saved = await prisma.patientDailyLog.upsert({
    where: { patientId_recordedDate: { patientId: patient.id, recordedDate } },
    create: { patientId: patient.id, recordedDate, fatigue, rpe, sleep },
    update: { fatigue, rpe, sleep },
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
