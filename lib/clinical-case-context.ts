/**
 * Recopila TODA la informacion relevante de un paciente para que Sonnet
 * pueda redactar el borrador del caso clinico narrativo (4 apartados
 * estilo PDF: situacion inicial, proceso, obstaculos, logros).
 *
 * NO calcula texto — solo devuelve un objeto JSON estructurado. La IA
 * escoge que destacar y en que profundidad segun la riqueza de datos.
 */
import { prisma } from "@/lib/prisma";

export type ClinicalCaseContext = {
  patient: {
    id: string;
    fullName: string;
    sport: string;
    programType: string | null;
    diagnosis: string | null;
    bodyZone: string | null;
    startedAt: string;
    programStartDate: string | null;
    programEndDate: string | null;
    programDurationMonths: number | null;
    monthsInProgram: number | null;
  };
  fisioNotes: string | null;
  anamnesisCallNotes: string | null;
  anamnesisData: any;
  renewalsCount: number;

  // Adherencia y sesiones
  sessions: {
    total: number;
    completed: number;
    adherencePct: number | null;
    firstCompletedAt: string | null;
    lastCompletedAt: string | null;
    // Sensaciones agrupadas (limitadas a las mas ricas)
    sensations: Array<{
      dayIso: string;
      programName: string;
      note: string;
    }>;
  };

  // Metricas clinicas de la biblioteca (dolor, rigidez, etc)
  metrics: Array<{
    key: string;
    name: string;
    firstValue: number | null;
    firstAt: string | null;
    lastValue: number | null;
    lastAt: string | null;
    minValue: number | null;
    maxValue: number | null;
    samples: number;
  }>;

  // Daily-log (fatiga, sueño, RPE)
  dailyLogTrends: {
    samples: number;
    fatigueAvg: number | null;
    sleepAvg: number | null;
    rpeAvg: number | null;
  };

  // Alertas IA generadas de las sensaciones
  alerts: Array<{
    kind: string;
    severity: string;
    summary: string;
    createdAt: string;
  }>;

  // Ultimos resumenes semanales (IA)
  weeklyReports: Array<{
    weekStart: string;
    summary: string;
    topFindings: string[];
    recommendations: string[];
  }>;

  // ADVANCE session logs (si aplica)
  advanceLogs: {
    total: number;
    lastNotes: Array<{ dayIso: string; note: string }>;
  };
};

export async function buildClinicalCaseContext(patientId: string): Promise<ClinicalCaseContext | null> {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return null;

  // Meses en programa (util para IA saber si lleva 2 semanas o 8 meses)
  let monthsInProgram: number | null = null;
  if (patient.programStartDate) {
    const now = new Date();
    monthsInProgram = Math.max(
      0,
      Math.round(
        ((now.getTime() - patient.programStartDate.getTime()) / (1000 * 60 * 60 * 24 * 30)) * 10,
      ) / 10,
    );
  }

  const [
    renewalsCount,
    sessions,
    patientMetrics,
    dailyLogs,
    alerts,
    weeklyReports,
    advanceLogs,
  ] = await Promise.all([
    prisma.subscriptionRenewal.count({ where: { patientId, isReservation: false } }),
    prisma.programSession.findMany({
      where: { assignment: { patientId } },
      include: { assignment: { include: { program: { select: { name: true } } } } },
      orderBy: { scheduledDate: "asc" },
    }),
    prisma.patientMetric.findMany({
      where: { patientId },
      include: {
        entries: { orderBy: { recordedAt: "asc" }, select: { value: true, recordedAt: true } },
      },
    }),
    prisma.patientDailyLog.findMany({
      where: { patientId },
      orderBy: { recordedDate: "asc" },
      select: { fatigue: true, rpe: true, sleep: true },
    }),
    prisma.patientAlert.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { kind: true, severity: true, summary: true, createdAt: true },
    }),
    (prisma as any).patientWeeklyReport.findMany({
      where: { patientId },
      orderBy: { weekStartDate: "desc" },
      take: 8,
      select: { weekStartDate: true, summary: true, highlights: true },
    }),
    (prisma as any).advanceSessionLog.findMany({
      where: { patientId },
      orderBy: { sessionDate: "asc" },
    }).catch(() => []),
  ]);

  // ─── Sesiones + sensaciones ───
  const completed = sessions.filter((s) => s.completedAt !== null);
  const withNotes = completed.filter((s) => s.patientNotes && s.patientNotes.trim().length > 0);
  // De todas las sensaciones nos quedamos con las MAS LARGAS (mas ricas
  // en contenido) — hasta 25 — mas la primera y la ultima para tener
  // arco temporal aunque sean cortas.
  const sortedByLen = [...withNotes].sort((a, b) => (b.patientNotes?.length ?? 0) - (a.patientNotes?.length ?? 0));
  const richest = sortedByLen.slice(0, 25);
  const bookendIds = new Set([withNotes[0]?.id, withNotes[withNotes.length - 1]?.id].filter(Boolean));
  const bookends = withNotes.filter((s) => bookendIds.has(s.id));
  const combined = Array.from(new Map([...richest, ...bookends].map((s) => [s.id, s])).values());
  combined.sort((a, b) => (a.completedAt ?? a.scheduledDate).getTime() - (b.completedAt ?? b.scheduledDate).getTime());

  const sensations = combined.map((s) => ({
    dayIso: (s.completedAt ?? s.scheduledDate).toISOString().slice(0, 10),
    programName: s.assignment?.program?.name ?? "",
    note: String(s.patientNotes ?? "").trim().slice(0, 900),
  }));

  const adherencePct = sessions.length > 0
    ? Math.round((completed.length / sessions.length) * 100)
    : null;

  // ─── Metricas ───
  const metrics = patientMetrics
    .filter((m) => m.entries.length > 0)
    .map((m) => {
      const values = m.entries.map((e) => e.value).filter((v): v is number => typeof v === "number");
      const first = m.entries[0];
      const last = m.entries[m.entries.length - 1];
      return {
        key: m.key,
        name: m.name,
        firstValue: (first?.value as number) ?? null,
        firstAt: first?.recordedAt?.toISOString().slice(0, 10) ?? null,
        lastValue: (last?.value as number) ?? null,
        lastAt: last?.recordedAt?.toISOString().slice(0, 10) ?? null,
        minValue: values.length ? Math.min(...values) : null,
        maxValue: values.length ? Math.max(...values) : null,
        samples: values.length,
      };
    });

  // ─── Tendencias daily-log ───
  const avg = (arr: number[]) => (arr.length ? Number((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1)) : null);
  const fatigueArr = dailyLogs.map((l: any) => l.fatigue).filter((v: any) => typeof v === "number");
  const sleepArr = dailyLogs.map((l: any) => l.sleep).filter((v: any) => typeof v === "number");
  const rpeArr = dailyLogs.map((l: any) => l.rpe).filter((v: any) => typeof v === "number");

  const dailyLogTrends = {
    samples: dailyLogs.length,
    fatigueAvg: avg(fatigueArr),
    sleepAvg: avg(sleepArr),
    rpeAvg: avg(rpeArr),
  };

  // ─── Resumenes semanales ───
  const weeklySlim = (weeklyReports as any[]).map((wr) => {
    let topFindings: string[] = [];
    let recommendations: string[] = [];
    try {
      const h = JSON.parse(wr.highlights ?? "{}");
      if (Array.isArray(h.topFindings)) topFindings = h.topFindings.slice(0, 5);
      if (Array.isArray(h.recommendations)) recommendations = h.recommendations.slice(0, 3);
    } catch { /* ignore */ }
    return {
      weekStart: wr.weekStartDate.toISOString().slice(0, 10),
      summary: String(wr.summary ?? "").slice(0, 700),
      topFindings,
      recommendations,
    };
  });

  // ─── ADVANCE session logs ───
  const advList = (advanceLogs as any[]) ?? [];
  const advWithNotes = advList.filter((l) => l.patientNotes && l.patientNotes.trim().length > 0);
  const advLatest = advWithNotes.slice(-15).map((l) => ({
    dayIso: (l.sessionDate as Date).toISOString().slice(0, 10),
    note: String(l.patientNotes ?? "").trim().slice(0, 600),
  }));

  return {
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      sport: patient.sport,
      programType: patient.programType,
      diagnosis: patient.diagnosis,
      bodyZone: patient.bodyZone,
      startedAt: patient.startedAt.toISOString().slice(0, 10),
      programStartDate: patient.programStartDate?.toISOString().slice(0, 10) ?? null,
      programEndDate: patient.programEndDate?.toISOString().slice(0, 10) ?? null,
      programDurationMonths: patient.programDurationMonths,
      monthsInProgram,
    },
    fisioNotes: patient.fisioNotes ? patient.fisioNotes.slice(0, 4000) : null,
    anamnesisCallNotes: patient.anamnesisCallNotes ? patient.anamnesisCallNotes.slice(0, 4000) : null,
    anamnesisData: (() => {
      try { return patient.anamnesisData ? JSON.parse(patient.anamnesisData) : null; }
      catch { return null; }
    })(),
    renewalsCount,
    sessions: {
      total: sessions.length,
      completed: completed.length,
      adherencePct,
      firstCompletedAt: completed[0]?.completedAt?.toISOString() ?? null,
      lastCompletedAt: completed[completed.length - 1]?.completedAt?.toISOString() ?? null,
      sensations,
    },
    metrics,
    dailyLogTrends,
    alerts: alerts.map((a) => ({
      kind: a.kind,
      severity: a.severity,
      summary: a.summary.slice(0, 300),
      createdAt: a.createdAt.toISOString().slice(0, 10),
    })),
    weeklyReports: weeklySlim,
    advanceLogs: {
      total: advList.length,
      lastNotes: advLatest,
    },
  };
}
