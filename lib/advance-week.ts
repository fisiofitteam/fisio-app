/**
 * Modelo "sesión N" para atletas ADVANCE.
 *
 * En vez de acoplarse al día natural (que provoca el conflicto "hoy es
 * martes y quiero marcar la sesión del lunes"), la semana del atleta se
 * expone como una lista ordenada de sesiones 1..N que se completan en
 * orden estricto.
 *
 * Cada sesión = un `dayOfWeek` concreto del rolling, con las tareas de
 * los bloques Accesorios + Entrenamiento concatenadas. El sessionIndex
 * viene del orden ascendente de dayOfWeek entre los días que el fisio
 * programó. Ejemplo: si el fisio programa entrenos en L (1), X (3), J (4),
 * V (5), el atleta ve Sesión 1 → L, Sesión 2 → X, Sesión 3 → J, Sesión 4 → V.
 *
 * Cada lunes la semana se resetea: sólo se miran los AdvanceSessionLog
 * con `weekStart` == este lunes para saber qué queda pendiente.
 */
import { prisma } from "@/lib/prisma";
import { resolveVisibleRollingWeek } from "@/lib/rolling-visible-week";
import { applyRollingOverridesToTasks, fetchOverridesForPatient } from "@/lib/apply-rolling-overrides";
import { weekStartForPatient } from "@/lib/patient-dates";

export type AdvanceTask = {
  id: string;
  type: string;
  title: string;
  bodyText: string | null;
  videoId: string | null;
  block: "Accesorios" | "Entrenamiento";
};

export type AdvanceSession = {
  sessionIndex: number; // 1..N
  dayOfWeek: number;    // 1..5 en el rolling (referencia interna)
  tasks: AdvanceTask[];
  completed: boolean;
  logId: string | null;
  patientNotes: string | null;
};

export type AdvanceWeekView = {
  weekStart: Date;
  sessions: AdvanceSession[];
  nextIndex: number | null; // 1..N del próximo pendiente. null = semana completada.
  allCompleted: boolean;
  totalCount: number;
  completedCount: number;
};

type PatientLite = {
  id: string;
  timezone: string | null;
  rollingAccessoriesId: string | null;
  rollingTrainingId: string | null;
  rollingProgramId: string | null;
};

/** Construye la vista de la semana ADVANCE para el atleta. Solo llamar
 *  con programType === "ADVANCE" (o compat si un PREVENTION llegara aqui). */
export async function buildAdvanceWeekView(patient: PatientLite, at: Date = new Date()): Promise<AdvanceWeekView> {
  const monday = weekStartForPatient(patient.timezone, at);
  const accId = patient.rollingAccessoriesId;
  const trnId = patient.rollingTrainingId || patient.rollingProgramId;

  // Trae la semana rolling con TODOS los dias L-V (dayOfWeek 1..5).
  const includeAllDays = {
    days: {
      where: { dayOfWeek: { gte: 1, lte: 5 } },
      include: { tasks: { orderBy: { order: "asc" } } },
    },
  };
  const [accWeek, trnWeek, overrides, videosPrefetch, logsThisWeek] = await Promise.all([
    resolveVisibleRollingWeek<any>(accId, monday, includeAllDays),
    resolveVisibleRollingWeek<any>(trnId, monday, includeAllDays),
    fetchOverridesForPatient(patient.id),
    // videos los resolvemos abajo cuando sepamos qué IDs necesitamos
    Promise.resolve<any[]>([]),
    (prisma as any).advanceSessionLog.findMany({
      where: { patientId: patient.id, weekStart: monday },
      orderBy: { sessionIndex: "asc" },
    }),
  ]);

  // Recolecta tareas por dayOfWeek, aplicando overrides individuales.
  const tasksByDow = new Map<number, AdvanceTask[]>();
  function collect(week: any, block: "Accesorios" | "Entrenamiento") {
    if (!week) return;
    for (const d of week.days as any[]) {
      const applied = applyRollingOverridesToTasks(d.tasks as any, overrides as any);
      if (applied.length === 0) continue;
      const bucket = tasksByDow.get(d.dayOfWeek) ?? [];
      for (const t of applied) {
        bucket.push({
          id: t.id,
          type: t.type,
          title: t.title,
          bodyText: t.bodyText ?? null,
          videoId: (t as any).videoId ?? null,
          block,
        });
      }
      tasksByDow.set(d.dayOfWeek, bucket);
    }
  }
  collect(accWeek, "Accesorios");
  collect(trnWeek, "Entrenamiento");

  // Ordena por dayOfWeek → asigna sessionIndex 1..N.
  const orderedDows = Array.from(tasksByDow.keys()).sort((a, b) => a - b);

  const logByIndex = new Map<number, any>();
  for (const l of logsThisWeek as any[]) {
    if (typeof l.sessionIndex === "number") logByIndex.set(l.sessionIndex, l);
  }

  const sessions: AdvanceSession[] = orderedDows.map((dow, i) => {
    const idx = i + 1;
    const log = logByIndex.get(idx) ?? null;
    return {
      sessionIndex: idx,
      dayOfWeek: dow,
      tasks: tasksByDow.get(dow) ?? [],
      completed: !!log,
      logId: log?.id ?? null,
      patientNotes: log?.patientNotes ?? null,
    };
  });

  // Orden estricto: la siguiente pendiente es el primer sessionIndex no completed.
  const nextIndex = sessions.find((s) => !s.completed)?.sessionIndex ?? null;
  const completedCount = sessions.filter((s) => s.completed).length;

  return {
    weekStart: monday,
    sessions,
    nextIndex,
    allCompleted: sessions.length > 0 && completedCount === sessions.length,
    totalCount: sessions.length,
    completedCount,
  };
}

/**
 * Construye el snapshot JSON de tareas para una sesión concreta (para
 * guardar en AdvanceSessionLog.tasksSnapshot). Reutiliza la vista de la
 * semana para no duplicar la lógica de rolling+overrides.
 */
export async function buildAdvanceSessionSnapshot(patient: PatientLite, sessionIndex: number, at: Date = new Date()): Promise<string | null> {
  try {
    const week = await buildAdvanceWeekView(patient, at);
    const session = week.sessions.find((s) => s.sessionIndex === sessionIndex);
    if (!session || session.tasks.length === 0) return null;

    // Añadimos youtubeUrl resuelto para que el historico no dependa del
    // catalogo actual.
    const videoIds = new Set<string>();
    for (const t of session.tasks) if (t.videoId) videoIds.add(t.videoId);
    const videos = videoIds.size > 0
      ? await prisma.videoLibrary.findMany({ where: { id: { in: Array.from(videoIds) } } })
      : [];
    const byId: Record<string, { youtubeUrl: string; title: string }> = {};
    for (const v of videos) byId[v.id] = { youtubeUrl: v.youtubeUrl, title: v.title };

    const snap = session.tasks.map((t) => ({
      id: t.id,
      type: t.type,
      title: t.title,
      bodyText: t.bodyText,
      videoId: t.videoId,
      youtubeUrl: t.videoId ? (byId[t.videoId]?.youtubeUrl ?? null) : null,
      block: t.block,
    }));
    return JSON.stringify(snap);
  } catch {
    return null;
  }
}
