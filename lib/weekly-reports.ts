/**
 * Generador de resumen semanal por paciente (Fase B).
 *
 * Cada domingo por la noche, el cron llama a runWeeklyReportsForWeek con el
 * lunes de la semana que acaba de terminar. Para cada paciente RECUPERA o
 * CONSOLIDA con >=2 sesiones completadas esa semana:
 *   1. Recopila datos objetivos (adherencia, medias diarias, delta vs
 *      semana anterior) y subjetivos (sensaciones que escribio el paciente).
 *   2. Pide a Sonnet 4.6 un resumen clinico corto + hitos + recomendaciones.
 *   3. Guarda un PatientWeeklyReport unico por (patientId, weekStartDate).
 *   4. Notifica al fisio asignado (PatientNotification kind="weekly_report").
 *
 * La IA NUNCA calcula numeros — todos los cardinales van pre-calculados en
 * el highlights JSON. La IA solo teje la narrativa.
 */
import { prisma } from "@/lib/prisma";
import { notifyProfessional } from "@/lib/notifications";

const MODEL_SONNET = "claude-sonnet-4-6";

// ────────────────────────── Utilidades de fecha ──────────────────────────

/** Lunes UTC 00:00 de la semana que contiene la fecha. */
export function weekStartUtc(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = day.getUTCDay(); // 0=Dom .. 6=Sab
  const offset = dow === 0 ? -6 : 1 - dow;
  day.setUTCDate(day.getUTCDate() + offset);
  return day;
}

/** [monday, nextMonday) — semi-open. */
function weekWindow(monday: Date): { start: Date; end: Date } {
  const end = new Date(monday);
  end.setUTCDate(monday.getUTCDate() + 7);
  return { start: monday, end };
}

// ────────────────────────── Recolector ──────────────────────────

export type WeeklyHighlights = {
  weekStart: string; // ISO
  weekEnd: string;
  sessionsCompleted: number;
  sessionsScheduled: number;
  adherencePct: number; // 0-100
  metrics: Array<{
    key: string;             // clinica: pain, stiffness… (auto de biblioteca)
    label: string;
    avg: number | null;      // media semana actual
    prevAvg: number | null;  // media semana anterior
    deltaPct: number | null; // (avg - prev) / prev * 100
    samples: number;
  }>;
  sensations: Array<{
    dayIso: string;    // date only
    dayName: string;
    note: string;      // patientNotes tal cual
    programName: string;
  }>;
  // Extraidos por la IA como highlights curados (0-4 items cada uno).
  topFindings: string[];
  recommendations: string[];
};

type Patient = {
  id: string;
  fullName: string;
  programType: string | null;
  assignedProfessionalId: string | null;
};

async function collectPatientWeekData(patient: Patient, monday: Date) {
  // ADVANCE tiene un flujo distinto: no hay ProgramSession, sino
  // AdvanceSessionLog (por dia). Las metricas son daily-log (fatigue/
  // RPE/sueño). Las sensaciones vienen del propio AdvanceSessionLog.
  if (patient.programType === "ADVANCE") {
    return await collectAdvanceWeekData(patient, monday);
  }
  return await collectRehabWeekData(patient, monday);
}

async function collectRehabWeekData(patient: Patient, monday: Date) {
  const { start, end } = weekWindow(monday);
  const prevStart = new Date(start);
  prevStart.setUTCDate(prevStart.getUTCDate() - 7);
  const prevEnd = new Date(start);

  // Cargamos definiciones de metricas auto de la biblioteca (dolor,
  // rigidez, etc). Solo estas son relevantes para RECUPERA/CONSOLIDA.
  const [scheduled, completed, metricDefs] = await Promise.all([
    prisma.programSession.count({
      where: {
        assignment: { patientId: patient.id, isActive: true },
        scheduledDate: { gte: start, lt: end },
      },
    }),
    prisma.programSession.findMany({
      where: {
        assignment: { patientId: patient.id, isActive: true },
        completedAt: { gte: start, lt: end },
      },
      include: { assignment: { include: { program: { select: { name: true } } } } },
      orderBy: { completedAt: "asc" },
    }),
    prisma.metricDefinition.findMany({
      where: { auto: true, active: true },
      orderBy: { order: "asc" },
      select: { key: true, name: true },
    }),
  ]);

  const adherencePct = scheduled > 0 ? Math.round((completed.length / scheduled) * 100) : 0;

  // Buscamos las MetricEntry de esta semana y de la anterior para cada
  // metricKey. Necesitamos el PatientMetric.id de cada key primero.
  const patientMetrics = await prisma.patientMetric.findMany({
    where: { patientId: patient.id, key: { in: metricDefs.map((d) => d.key) } },
    select: { id: true, key: true, name: true },
  });
  const metricIds = patientMetrics.map((m) => m.id);
  const entries = metricIds.length > 0
    ? await prisma.metricEntry.findMany({
        where: {
          metricId: { in: metricIds },
          recordedAt: { gte: prevStart, lt: end },
        },
        select: { metricId: true, value: true, recordedAt: true },
      })
    : [];

  function avgFor(metricId: string, from: Date, to: Date): { avg: number | null; samples: number } {
    const vals = entries
      .filter((e) => e.metricId === metricId && e.recordedAt >= from && e.recordedAt < to)
      .map((e) => e.value)
      .filter((v) => typeof v === "number");
    if (vals.length === 0) return { avg: null, samples: 0 };
    const a = vals.reduce((s, v) => s + v, 0) / vals.length;
    return { avg: Number(a.toFixed(2)), samples: vals.length };
  }

  function delta(cur: number | null, prev: number | null): number | null {
    if (cur === null || prev === null || prev === 0) return null;
    return Number((((cur - prev) / prev) * 100).toFixed(1));
  }

  const metrics = patientMetrics.map((pm) => {
    const cur = avgFor(pm.id, start, end);
    const prev = avgFor(pm.id, prevStart, prevEnd);
    return {
      key: pm.key,
      label: pm.name,
      avg: cur.avg,
      prevAvg: prev.avg,
      deltaPct: delta(cur.avg, prev.avg),
      samples: cur.samples,
    };
  }).filter((m) => m.samples > 0 || m.prevAvg !== null); // solo pintamos las que tienen datos

  const sensations = completed
    .filter((s) => s.patientNotes && s.patientNotes.trim().length > 0)
    .map((s) => {
      const when = new Date(s.completedAt ?? s.scheduledDate);
      return {
        dayIso: when.toISOString().slice(0, 10),
        dayName: when.toLocaleDateString("es-ES", { weekday: "long" }),
        note: String(s.patientNotes ?? "").trim(),
        programName: s.assignment?.program?.name ?? "",
      };
    });

  return {
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    sessionsCompleted: completed.length,
    sessionsScheduled: scheduled,
    adherencePct,
    metrics,
    sensations,
  };
}

// ────────────────────────── Recolector ADVANCE ──────────────────────────

async function collectAdvanceWeekData(patient: Patient, monday: Date) {
  const { start, end } = weekWindow(monday);
  const prevStart = new Date(start);
  prevStart.setUTCDate(prevStart.getUTCDate() - 7);
  const prevEnd = new Date(start);

  const [sessionLogs, dailyLogs, prevDailyLogs] = await Promise.all([
    (prisma as any).advanceSessionLog.findMany({
      where: { patientId: patient.id, sessionDate: { gte: start, lt: end } },
      orderBy: { sessionDate: "asc" },
    }),
    prisma.patientDailyLog.findMany({
      where: { patientId: patient.id, recordedDate: { gte: start, lt: end } },
    }),
    prisma.patientDailyLog.findMany({
      where: { patientId: patient.id, recordedDate: { gte: prevStart, lt: prevEnd } },
    }),
  ]);

  // Programado = número de sesiones planificadas en el rolling de esta
  // semana (puede ser 3, 4 o 5 según lo que meta el CEO). Cargamos la
  // vista canónica de la semana para ser coherente con lo que ve el atleta.
  const fullPatient = await prisma.patient.findUnique({
    where: { id: patient.id },
    select: {
      timezone: true, rollingAccessoriesId: true, rollingTrainingId: true, rollingProgramId: true,
    },
  });
  const advWeekView = fullPatient
    ? await (await import("./advance-week")).buildAdvanceWeekView(
        { id: patient.id, ...fullPatient },
        monday,
      ).catch(() => null)
    : null;
  const sessionsScheduled = advWeekView?.totalCount ?? sessionLogs.length ?? 0;
  const sessionsCompleted = sessionLogs.length;
  const adherencePct = sessionsScheduled > 0 ? Math.round((sessionsCompleted / sessionsScheduled) * 100) : 0;

  function avgOf(rows: typeof dailyLogs, key: "fatigue" | "rpe" | "sleep"): { avg: number | null; samples: number } {
    const vals = rows.map((r) => (r as any)[key] as number).filter((v) => typeof v === "number");
    if (vals.length === 0) return { avg: null, samples: 0 };
    const a = vals.reduce((s, v) => s + v, 0) / vals.length;
    return { avg: Number(a.toFixed(2)), samples: vals.length };
  }
  function delta(cur: number | null, prev: number | null): number | null {
    if (cur === null || prev === null || prev === 0) return null;
    return Number((((cur - prev) / prev) * 100).toFixed(1));
  }

  const metricDefs: Array<{ key: "fatigue" | "rpe" | "sleep"; label: string }> = [
    { key: "fatigue", label: "Fatiga" },
    { key: "rpe", label: "RPE" },
    { key: "sleep", label: "Sueño" },
  ];
  const metrics = metricDefs.map((m) => {
    const cur = avgOf(dailyLogs, m.key);
    const prev = avgOf(prevDailyLogs, m.key);
    return {
      key: m.key,
      label: m.label,
      avg: cur.avg,
      prevAvg: prev.avg,
      deltaPct: delta(cur.avg, prev.avg),
      samples: cur.samples,
    };
  }).filter((m) => m.samples > 0 || m.prevAvg !== null);

  const sensations = sessionLogs
    .filter((s: any) => s.patientNotes && s.patientNotes.trim().length > 0)
    .map((s: any) => {
      const when = new Date(s.sessionDate);
      return {
        dayIso: when.toISOString().slice(0, 10),
        dayName: when.toLocaleDateString("es-ES", { weekday: "long" }),
        note: String(s.patientNotes ?? "").trim(),
        programName: "ADVANCE",
      };
    });

  return {
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    sessionsCompleted,
    sessionsScheduled,
    adherencePct,
    metrics,
    sensations,
  };
}

// ────────────────────────── IA (Sonnet) ──────────────────────────

const SYSTEM_PROMPT = `Eres un fisioterapeuta senior redactando el resumen semanal de un paciente para el fisio que le lleva.

Recibiras un JSON con:
- Datos objetivos de la semana (numero de sesiones, adherencia, medias de las metricas clinicas del paciente — pueden ser dolor, rigidez, dolor al inicio del dia, etc segun lo que el CEO haya configurado; los labels vienen en el JSON — y deltas vs semana anterior).
- Sensaciones que escribio el paciente al terminar cada sesion.
- Metadatos del paciente (nombre, programa RECUPERA o CONSOLIDA).

Devuelve EXCLUSIVAMENTE un JSON valido (sin texto antes ni despues, sin code fences) con esta forma:

{
  "summary": "150-350 caracteres. Vision global de la semana: como ha ido, patrones, algo destacable. Tono clinico pero calido — hablas al fisio, no al paciente. Español. Empieza con el hecho clave.",
  "topFindings": ["3-5 hallazgos concretos", "cada uno una frase corta", "hitos reales, no genericos"],
  "recommendations": ["1-3 sugerencias accionables para el fisio", "muy concretas, con verbos", "algo que pueda ajustar la proxima sesion"]
}

Reglas:
- NO inventes numeros — usa solo los que vienen en el JSON.
- Si NO hay sensaciones registradas, dilo en el summary pero no en topFindings.
- Si adherencia < 50%, mencionalo como algo relevante.
- Si algun delta de metrica es > 20%, es un findings automatico.
- topFindings pueden mezclar objetivo ("Adherencia 80% pese a subida de fatiga +25%") y subjetivo ("Reporta dolor lumbar recurrente al agacharse").
- recommendations tipo: "Bajar carga del press militar", "Insistir en descanso los martes", "Revisar tecnica de sentadilla" — nada abstracto.
- Cuando dudes entre optimista y prudente, prudente.`;

async function generateWithAi(data: { patient: Patient; highlights: Omit<WeeklyHighlights, "topFindings" | "recommendations"> }): Promise<{ summary: string; topFindings: string[]; recommendations: string[] } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const userPayload = {
    patient: {
      name: data.patient.fullName,
      program: data.patient.programType,
    },
    week: data.highlights,
  };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL_SONNET,
        max_tokens: 900,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(userPayload) }],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const text: string = j?.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 800) : "";
    const topFindings = Array.isArray(parsed.topFindings)
      ? parsed.topFindings.filter((s: any) => typeof s === "string" && s.trim()).slice(0, 5)
      : [];
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter((s: any) => typeof s === "string" && s.trim()).slice(0, 3)
      : [];
    if (!summary) return null;
    return { summary, topFindings, recommendations };
  } catch {
    return null;
  }
}

// ────────────────────────── Persistencia + notificacion ──────────────────────────

async function saveReport(patientId: string, monday: Date, summary: string, highlights: WeeklyHighlights) {
  return await (prisma as any).patientWeeklyReport.upsert({
    where: { patientId_weekStartDate: { patientId, weekStartDate: monday } },
    create: {
      patientId,
      weekStartDate: monday,
      summary,
      highlights: JSON.stringify(highlights),
    },
    update: {
      summary,
      highlights: JSON.stringify(highlights),
      generatedAt: new Date(),
      // Al regenerar, olvidamos el dismiss previo — el fisio deberia
      // ver el nuevo en el feed lunes.
      dismissedAt: null,
      dismissedById: null,
    },
  });
}

/**
 * Notifica UNA sola vez por fisio con el conteo de resumenes generados
 * esta ronda. Antes mandabamos uno por paciente y saturaba la campanita.
 */
async function notifyFisiosAggregated(counts: Map<string, number>, monday: Date) {
  const weekLabel = monday.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  // No notificamos a profesionales con rol="ceo" — el CEO no quiere ruido
  // de resumenes individuales, solo el ejecutivo global ADVANCE.
  const professionals = await prisma.professional.findMany({
    where: { id: { in: Array.from(counts.keys()) }, role: { not: "ceo" } },
    select: { id: true },
  });
  const allowed = new Set(professionals.map((p) => p.id));
  await Promise.all(
    Array.from(counts.entries())
      .filter(([professionalId]) => allowed.has(professionalId))
      .map(([professionalId, n]) =>
        notifyProfessional({
          professionalId,
          type: "weekly_report_ready",
          title: n === 1 ? "Nuevo resumen semanal" : `Nuevos resumenes semanales (${n})`,
          body: n === 1
            ? `Ya tienes listo el resumen de la semana del ${weekLabel} de un paciente. Pulsa para verlo.`
            : `Ya tienes listos los resumenes de la semana del ${weekLabel} de tus pacientes. Pulsa para verlos.`,
          actionUrl: `/fisio/resumenes?week=${monday.toISOString().slice(0, 10)}`,
        }).catch(() => {})
      )
  );
}

// ────────────────────────── Orquestador ──────────────────────────

export type WeeklyReportsRunResult = {
  monday: string;
  processed: number;
  generated: number;
  skipped: number;
  errors: number;
  advanceProcessed: number;
  advanceGlobalGenerated: boolean;
};

/** Genera reportes para una semana concreta. Idempotente: si ya existe, actualiza. */
export async function runWeeklyReportsForWeek(monday: Date, opts?: { force?: boolean }): Promise<WeeklyReportsRunResult> {
  // Sin `force`, saltamos los reports ya generados para esta semana.
  // Esto convierte el cron en re-ejecutable: el disparo dominical genera,
  // el disparo lunes por la mañana solo actúa si el domingo se saltó.
  const force = opts?.force ?? false;
  const { start, end } = weekWindow(monday);

  // ─── RECUPERA / CONSOLIDA: ≥2 ProgramSession completadas esa semana ───
  const grouped = await prisma.programSession.groupBy({
    by: ["assignmentId"],
    where: {
      completedAt: { gte: start, lt: end },
      assignment: {
        isActive: true,
        // Excluimos pacientes fantasma (test) del generador semanal.
        patient: { programType: { in: ["RECUPERA", "CONSOLIDA"] }, isTest: false },
      },
    },
    _count: { _all: true },
  });
  const assignmentIds = grouped.filter((g) => g._count._all >= 2).map((g) => g.assignmentId);
  const rehabByPatient = new Map<string, Patient>();
  if (assignmentIds.length > 0) {
    const assignments = await prisma.programAssignment.findMany({
      where: { id: { in: assignmentIds } },
      include: {
        patient: { select: { id: true, fullName: true, programType: true, assignedProfessionalId: true } },
      },
    });
    for (const a of assignments) {
      if (!rehabByPatient.has(a.patient.id)) rehabByPatient.set(a.patient.id, a.patient as Patient);
    }
  }

  // ─── ADVANCE: ≥2 AdvanceSessionLog en la semana ───
  const advanceGrouped: Array<{ patientId: string; _count: { _all: number } }> = await (prisma as any).advanceSessionLog.groupBy({
    by: ["patientId"],
    where: { sessionDate: { gte: start, lt: end } },
    _count: { _all: true },
  });
  const advancePatientIds = advanceGrouped.filter((g) => g._count._all >= 2).map((g) => g.patientId);
  const advanceByPatient = new Map<string, Patient>();
  if (advancePatientIds.length > 0) {
    const advPatients = await prisma.patient.findMany({
      where: { id: { in: advancePatientIds }, programType: "ADVANCE", isTest: false },
      select: { id: true, fullName: true, programType: true, assignedProfessionalId: true },
    });
    for (const p of advPatients) advanceByPatient.set(p.id, p as Patient);
  }

  let generated = 0;
  let skipped = 0;
  let errors = 0;
  // Solo notificamos por fisio en RECUPERA/CONSOLIDA. ADVANCE genera
  // reports individuales para archivo (ficha wods) pero NO notifica al
  // fisio asignado — el CEO recibe el card global mas abajo.
  const perFisio = new Map<string, number>();
  const advanceGenerated: Array<{ patient: Patient; highlights: WeeklyHighlights; summary: string }> = [];

  async function processOne(patient: Patient, minCompleted: number, notifyFisio: boolean) {
    try {
      // Idempotencia: si ya existe report para (paciente, semana), saltamos
      // (ni AI ni notificación). Solo `force` regenera.
      if (!force) {
        const existing = await (prisma as any).patientWeeklyReport.findUnique({
          where: { patientId_weekStartDate: { patientId: patient.id, weekStartDate: monday } },
          select: { id: true },
        });
        if (existing) { skipped++; return; }
      }
      const base = await collectPatientWeekData(patient, monday);
      if (base.sessionsCompleted < minCompleted) { skipped++; return; }
      const ai = await generateWithAi({ patient, highlights: base });
      const summary = ai?.summary ?? `${patient.fullName} completó ${base.sessionsCompleted}/${base.sessionsScheduled} sesiones esta semana. Sin IA disponible.`;
      const highlights: WeeklyHighlights = {
        ...base,
        topFindings: ai?.topFindings ?? [],
        recommendations: ai?.recommendations ?? [],
      };
      await saveReport(patient.id, monday, summary, highlights);
      if (notifyFisio && patient.assignedProfessionalId) {
        perFisio.set(patient.assignedProfessionalId, (perFisio.get(patient.assignedProfessionalId) ?? 0) + 1);
      }
      if (patient.programType === "ADVANCE") {
        advanceGenerated.push({ patient, highlights, summary });
      }
      generated++;
    } catch {
      errors++;
    }
  }

  // Procesamos por lotes en paralelo para no tardar N * (llamada Sonnet)
  // segundos. Sonnet 4.6 admite muchas requests concurrentes; 10 en paralelo
  // deja margen para el rate limit y minimiza el tiempo total del cron.
  //
  // Antes: 40 pacientes * 4-6s cada uno = 160-240s solo en RECUPERA/CONSOLIDA,
  // + otro tanto en ADVANCE, + el card global. Con batches de 10 baja a
  // ~20-25s totales por rama. Logs con duración para ver regresiones.
  const CONCURRENCY = 10;
  async function processInBatches(label: string, patients: Patient[], notifyFisio: boolean) {
    if (patients.length === 0) return;
    const t0 = Date.now();
    for (let i = 0; i < patients.length; i += CONCURRENCY) {
      const slice = patients.slice(i, i + CONCURRENCY);
      await Promise.all(slice.map((p) => processOne(p, 2, notifyFisio)));
    }
    console.log(`[weekly-reports] ${label}: ${patients.length} pacientes en ${Date.now() - t0}ms`);
  }
  await processInBatches("REHAB", Array.from(rehabByPatient.values()), true);
  await processInBatches("ADVANCE", Array.from(advanceByPatient.values()), false);

  if (perFisio.size > 0) {
    await notifyFisiosAggregated(perFisio, monday);
  }

  // ─── Card ejecutivo global ADVANCE ───
  let advanceGlobalGenerated = false;
  if (advanceGenerated.length > 0) {
    try {
      if (!force) {
        // Si ya existe el resumen global ADVANCE de esta semana, no
        // regeneramos ni renotificamos.
        const existingAdv = await (prisma as any).advanceWeeklySummary.findUnique({
          where: { weekStartDate: monday },
          select: { id: true },
        });
        if (existingAdv) {
          advanceGlobalGenerated = true;
        }
      }
      if (!advanceGlobalGenerated) {
        await generateAdvanceGlobalSummary(monday, advanceGenerated);
        advanceGlobalGenerated = true;
        await notifyManagersAdvanceGlobal(monday, advanceGenerated.length);
      }
    } catch { /* silencioso */ }
  }

  return {
    monday: monday.toISOString(),
    processed: rehabByPatient.size + advanceByPatient.size,
    generated,
    skipped,
    errors,
    advanceProcessed: advanceByPatient.size,
    advanceGlobalGenerated,
  };
}

// ────────────────────────── Resumen global ADVANCE ──────────────────────────

const ADVANCE_GLOBAL_SYSTEM_PROMPT = `Eres el jefe de rendimiento de FisioFit escribiendo un ejecutivo semanal de TODOS los atletas ADVANCE para el CEO.

Recibiras un JSON con: fecha de la semana, lista de atletas con sus datos (adherencia, medias de fatiga/RPE/sueño, deltas vs semana anterior, sensaciones destacadas).

Devuelve EXCLUSIVAMENTE un JSON con esta forma:

{
  "summary": "300-600 caracteres. Vision ejecutiva de la semana en ADVANCE: adherencia global, patrones detectados (metricas cargadas, atletas destacados por bien o por mal), y valoracion general. Tono directo, para el CEO. Español.",
  "attentionCases": ["Nombre completo — motivo concreto (dolor lumbar reportado 3 dias, fatiga +30% vs media…)", "otro caso similar"],
  "wins": ["Nombre — hito positivo (adherencia 100% con RPE bajo, resultados de PR…)", "otro"],
  "recommendations": ["1-3 sugerencias tacticas para el CEO", "acciones concretas"]
}

Reglas:
- NO inventes numeros ni nombres — usa exactamente los que vienen en el JSON.
- attentionCases: solo los que REALMENTE requieren atencion (dolor, empeoramiento, adherencia baja). No fuerces N.
- wins: casos donde algo va notablemente bien. No fuerces N.
- Si la semana ha sido rutinaria, dilo — no adornes.`;

async function generateAdvanceGlobalSummary(monday: Date, items: Array<{ patient: Patient; highlights: WeeklyHighlights; summary: string }>) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const weekLabel = monday.toISOString().slice(0, 10);
  const payload = {
    week: weekLabel,
    athletesCount: items.length,
    athletes: items.map((i) => ({
      name: i.patient.fullName,
      adherencePct: i.highlights.adherencePct,
      sessionsCompleted: i.highlights.sessionsCompleted,
      metrics: i.highlights.metrics,
      sensations: i.highlights.sensations.map((s) => ({ day: s.dayName, note: s.note.slice(0, 220) })),
      individualSummary: i.summary,
    })),
  };

  let summary = `Semana del ${weekLabel}: ${items.length} atletas ADVANCE con seguimiento (adherencia media ${Math.round(items.reduce((s, i) => s + i.highlights.adherencePct, 0) / items.length)}%).`;
  let attentionCases: string[] = [];
  let wins: string[] = [];
  let recommendations: string[] = [];

  if (apiKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODEL_SONNET,
          max_tokens: 1500,
          system: ADVANCE_GLOBAL_SYSTEM_PROMPT,
          messages: [{ role: "user", content: JSON.stringify(payload) }],
        }),
      });
      if (res.ok) {
        const j = await res.json();
        const text: string = j?.content?.[0]?.text ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (typeof parsed.summary === "string" && parsed.summary.trim()) summary = parsed.summary.trim();
          if (Array.isArray(parsed.attentionCases)) attentionCases = parsed.attentionCases.filter((s: any) => typeof s === "string" && s.trim()).slice(0, 10);
          if (Array.isArray(parsed.wins)) wins = parsed.wins.filter((s: any) => typeof s === "string" && s.trim()).slice(0, 8);
          if (Array.isArray(parsed.recommendations)) recommendations = parsed.recommendations.filter((s: any) => typeof s === "string" && s.trim()).slice(0, 5);
        }
      }
    } catch { /* silencioso, dejamos el summary por defecto */ }
  }

  const highlights = {
    weekStart: monday.toISOString(),
    athletesCount: items.length,
    adherenceAvg: Math.round(items.reduce((s, i) => s + i.highlights.adherencePct, 0) / items.length),
    attentionCases,
    wins,
    recommendations,
    // Lista compacta para poder consultar/desplegar sin repedir a la IA.
    athletes: items.map((i) => ({
      id: i.patient.id,
      name: i.patient.fullName,
      adherencePct: i.highlights.adherencePct,
      sessionsCompleted: i.highlights.sessionsCompleted,
    })),
  };

  await (prisma as any).advanceWeeklySummary.upsert({
    where: { weekStartDate: monday },
    create: {
      weekStartDate: monday,
      summary,
      highlights: JSON.stringify(highlights),
      patientsCount: items.length,
    },
    update: {
      summary,
      highlights: JSON.stringify(highlights),
      patientsCount: items.length,
      generatedAt: new Date(),
      dismissedAt: null,
      dismissedById: null,
    },
  });
}

async function notifyManagersAdvanceGlobal(monday: Date, count: number) {
  const managers = await prisma.professional.findMany({
    where: { active: true, role: { in: ["ceo", "head_success"] } },
    select: { id: true },
  });
  const weekLabel = monday.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  await Promise.all(
    managers.map((m) =>
      notifyProfessional({
        professionalId: m.id,
        type: "weekly_report_ready",
        title: "Ejecutivo semanal ADVANCE",
        body: `Ya tienes el resumen global de los ${count} atletas ADVANCE de la semana del ${weekLabel}. Pulsa para verlo.`,
        actionUrl: `/fisio/resumenes?week=${monday.toISOString().slice(0, 10)}`,
      }).catch(() => {})
    )
  );
}
