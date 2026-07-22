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
  const { start, end } = weekWindow(monday);
  const prevStart = new Date(start);
  prevStart.setUTCDate(prevStart.getUTCDate() - 7);
  const prevEnd = new Date(start);

  // Cargamos definiciones de metricas auto de la biblioteca (dolor,
  // rigidez, etc). Solo estas son relevantes para RECUPERA/CONSOLIDA,
  // que son los unicos pacientes que reciben resumen semanal.
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
  await Promise.all(
    Array.from(counts.entries()).map(([professionalId, n]) =>
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
};

/** Genera reportes para una semana concreta. Idempotente: si ya existe, actualiza. */
export async function runWeeklyReportsForWeek(monday: Date): Promise<WeeklyReportsRunResult> {
  const { start, end } = weekWindow(monday);

  // Encuentra pacientes RECUPERA/CONSOLIDA con >=2 sesiones completadas esa semana.
  const grouped = await prisma.programSession.groupBy({
    by: ["assignmentId"],
    where: {
      completedAt: { gte: start, lt: end },
      assignment: {
        isActive: true,
        patient: { programType: { in: ["RECUPERA", "CONSOLIDA"] } },
      },
    },
    _count: { _all: true },
  });
  const assignmentIds = grouped.filter((g) => g._count._all >= 2).map((g) => g.assignmentId);
  if (assignmentIds.length === 0) {
    return { monday: monday.toISOString(), processed: 0, generated: 0, skipped: 0, errors: 0 };
  }

  const assignments = await prisma.programAssignment.findMany({
    where: { id: { in: assignmentIds } },
    include: {
      patient: { select: { id: true, fullName: true, programType: true, assignedProfessionalId: true } },
    },
  });
  // Deduplicamos por paciente (varios assignments del mismo paciente cuentan como 1).
  const byPatient = new Map<string, Patient>();
  for (const a of assignments) {
    if (!byPatient.has(a.patient.id)) byPatient.set(a.patient.id, a.patient as Patient);
  }

  let generated = 0;
  let skipped = 0;
  let errors = 0;
  // Acumulamos generados por fisio-asignado para mandar UNA sola
  // notificacion al final por profesional en vez de spamear la campanita.
  const perFisio = new Map<string, number>();
  for (const patient of byPatient.values()) {
    try {
      const base = await collectPatientWeekData(patient, monday);
      if (base.sessionsCompleted < 2) { skipped++; continue; }

      const ai = await generateWithAi({ patient, highlights: base });
      const summary = ai?.summary ?? `${patient.fullName} completó ${base.sessionsCompleted}/${base.sessionsScheduled} sesiones esta semana. Sin IA disponible para redactar el resumen.`;
      const highlights: WeeklyHighlights = {
        ...base,
        topFindings: ai?.topFindings ?? [],
        recommendations: ai?.recommendations ?? [],
      };
      await saveReport(patient.id, monday, summary, highlights);
      if (patient.assignedProfessionalId) {
        perFisio.set(patient.assignedProfessionalId, (perFisio.get(patient.assignedProfessionalId) ?? 0) + 1);
      }
      generated++;
    } catch {
      errors++;
    }
  }

  if (perFisio.size > 0) {
    await notifyFisiosAggregated(perFisio, monday);
  }

  return {
    monday: monday.toISOString(),
    processed: byPatient.size,
    generated,
    skipped,
    errors,
  };
}
