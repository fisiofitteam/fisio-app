import { prisma } from "@/lib/prisma";
import { AdvanceDashboard } from "@/components/AdvanceDashboard";
import { todayMadridUtc } from "@/lib/program-pauses";

// Dashboard global ADVANCE: medias diarias de fatigue/rpe/sleep agregadas sobre
// todos los pacientes ADVANCE rolling que registran log diario.
// Acceso restringido por el layout a CEO + head_success.
export default async function AdvancePulsoPage() {
  const today = todayMadridUtc();
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 59); // 60 días incluyendo hoy

  const [logs, advanceRollingPatients] = await Promise.all([
    prisma.patientDailyLog.findMany({
      where: { recordedDate: { gte: start } },
      select: {
        patientId: true,
        recordedDate: true,
        fatigue: true,
        rpe: true,
        sleep: true,
      },
    }).catch(() => [] as any[]),
    prisma.patient.count({
      where: {
        isTest: false,
        programMode: "rolling",
        OR: [
          { rollingAccessoriesId: { not: null } },
          { rollingTrainingId: { not: null } },
          { rollingProgramId: { not: null } },
        ],
      },
    }),
  ]);

  // Construir mapa día -> agregado
  type Bucket = { fatigue: number[]; rpe: number[]; sleep: number[] };
  const byDay = new Map<string, Bucket>();
  for (let i = 0; i < 60; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    byDay.set(d.toISOString(), { fatigue: [], rpe: [], sleep: [] });
  }
  const todayMs = today.getTime();
  const sevenAgoMs = todayMs - 6 * 86400000;
  const thirtyAgoMs = todayMs - 29 * 86400000;
  const loggers7 = new Set<string>();
  const loggers30 = new Set<string>();

  for (const e of logs) {
    const key = e.recordedDate.toISOString();
    const b = byDay.get(key);
    if (b) {
      b.fatigue.push(e.fatigue);
      b.rpe.push(e.rpe);
      b.sleep.push(e.sleep);
    }
    const ms = e.recordedDate.getTime();
    if (ms >= thirtyAgoMs) loggers30.add(e.patientId);
    if (ms >= sevenAgoMs) loggers7.add(e.patientId);
  }
  const avg = (xs: number[]) => xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
  const daily = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateIso, b]) => ({
      dateIso,
      fatigueAvg: avg(b.fatigue),
      rpeAvg: avg(b.rpe),
      sleepAvg: avg(b.sleep),
      entries: b.fatigue.length,
    }));

  return (
    <AdvanceDashboard
      daily={daily}
      advanceRollingPatients={advanceRollingPatients}
      uniqueLoggers7d={loggers7.size}
      uniqueLoggers30d={loggers30.size}
    />
  );
}
