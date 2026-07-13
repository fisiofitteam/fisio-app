import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { weekStartDate, todayMadridUtc } from "@/lib/program-pauses";
import { resolveVisibleRollingWeek } from "@/lib/rolling-visible-week";
import { applyRollingOverridesToTasks, fetchOverridesForPatient } from "@/lib/apply-rolling-overrides";
import { PatientDailyLogForm } from "@/components/PatientDailyLogForm";
import { RollingExerciseVideos, type RollingExercise } from "@/components/RollingExerciseVideos";
import { TaskTimerButton } from "@/components/TaskTimerButton";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const TYPE_LABELS: Record<string, string> = {
  WORKOUT: "Workout",
  VIDEO: "Vídeo",
  FORM: "Formulario",
  EVOLUTION: "Evolución",
};
const TYPE_ICONS: Record<string, string> = {
  WORKOUT: "💪",
  VIDEO: "🎥",
  FORM: "📝",
  EVOLUTION: "📊",
};

type ResolvedTask = {
  id: string;
  type: string;
  title: string;
  bodyText: string | null;
  youtubeUrl: string | null;
  exercises: RollingExercise[];
};

export default async function SesionHoyPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      fullName: true,
      programType: true,
      rollingAccessoriesId: true,
      rollingTrainingId: true,
      rollingProgramId: true,
    },
  });
  if (!patient) notFound();

  const today = new Date();
  const todayDow = today.getDay(); // 0..6 (0=domingo). Las tareas usan 1..5.
  const thisMonday = weekStartDate(today);

  const isPrevention = patient.programType === "PREVENTION";
  // Prevention: single-rolling en el campo legacy rollingProgramId.
  const accId = isPrevention ? null : patient.rollingAccessoriesId;
  const trnId = isPrevention
    ? patient.rollingProgramId
    : (patient.rollingTrainingId || patient.rollingProgramId);

  async function fetchDayTasks(programId: string | null) {
    // Semana visible: la actual si está publicada, si no la próxima
    // publicada. `days` se filtra al día de hoy en ambos casos — si el
    // atleta ve la semana futura, sigue viendo el mismo dow (ej. si es
    // sábado y solo hay la semana que viene, ve el sábado de la semana
    // que viene, que no existirá en tareas L→V y quedará vacío).
    const week: any = await resolveVisibleRollingWeek(programId, thisMonday, {
      days: {
        where: { dayOfWeek: todayDow },
        include: {
          tasks: {
            orderBy: { order: "asc" },
            include: {
              exercises: {
                orderBy: { order: "asc" },
                include: { exercise: { select: { id: true, name: true, category: true, youtubeUrl: true, description: true } } },
              },
            },
          },
        },
      },
    });
    if (!week) return [];
    return week.days.flatMap((d: any) => d.tasks);
  }

  const [accTasksRaw, trnTasksRaw, overrides] = await Promise.all([
    fetchDayTasks(accId),
    fetchDayTasks(trnId),
    fetchOverridesForPatient(patient.id),
  ]);
  // Aplica overrides individuales del atleta (fisio puede haber ocultado /
  // modificado tareas para él). Los IDs de RollingTask son estables.
  const accTasksOv = applyRollingOverridesToTasks(accTasksRaw as any, overrides as any);
  const trnTasksOv = applyRollingOverridesToTasks(trnTasksRaw as any, overrides as any);

  // Resolver vídeos referenciados
  const videoIds = new Set<string>();
  for (const t of [...accTasksOv, ...trnTasksOv]) {
    if ((t.type === "VIDEO" || t.type === "WORKOUT") && t.videoId) videoIds.add(t.videoId);
  }
  const videosById: Record<string, { youtubeUrl: string }> = {};
  if (videoIds.size > 0) {
    const vids = await prisma.videoLibrary.findMany({
      where: { id: { in: Array.from(videoIds) } },
    });
    for (const v of vids) videosById[v.id] = { youtubeUrl: v.youtubeUrl };
  }

  const resolve = (tasks: typeof accTasksRaw): ResolvedTask[] =>
    tasks.map((t: any) => ({
      id: t.id,
      type: t.type,
      title: t.title,
      bodyText: t.bodyText,
      youtubeUrl: t.videoId ? videosById[t.videoId]?.youtubeUrl ?? null : null,
      exercises: ((t as any).exercises ?? []).map((we: any) => ({
        id: we.exercise.id,
        name: we.exercise.name,
        category: we.exercise.category,
        youtubeUrl: we.exercise.youtubeUrl,
        description: we.exercise.description,
      })) as RollingExercise[],
    }));

  const accTasks = resolve(accTasksOv as any);
  const trnTasks = resolve(trnTasksOv as any);
  const hasAny = accTasks.length > 0 || trnTasks.length > 0;

  // Log diario de hoy (para precargar el formulario si ya registró)
  const todayUtc = todayMadridUtc();
  const todayLog = await prisma.patientDailyLog.findUnique({
    where: { patientId_recordedDate: { patientId: patient.id, recordedDate: todayUtc } },
  }).catch(() => null);

  return (
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-16">
        <Link
          href={`/paciente/${patient.id}`}
          className="inline-flex items-center gap-1 text-xs mb-6"
          style={{ color: "var(--p-text-faint)" }}
        >
          <ArrowLeft size={12} /> Volver
        </Link>

        <header className="mb-6">
          <div className="text-[10px] font-bold tracking-wider uppercase mb-1" style={{ color: "var(--p-text-faint)" }}>
            {DAY_NAMES[todayDow]} · {today.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-2" style={{ letterSpacing: "-0.03em" }}>
            {isPrevention ? "🧘 Tu sesión" : "💪 Sesión de hoy"}
          </h1>
        </header>

        {isPrevention ? (
          // Prevention: un único tramo, sin etiqueta de bloque
          trnTasks.length > 0 && (
            <div className="space-y-2">
              {trnTasks.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          )
        ) : (
          <>
            {accTasks.length > 0 && (
              <SectionBlock label="Accesorios" color="#3B82F6" tasks={accTasks} />
            )}

            {trnTasks.length > 0 && (
              <SectionBlock label="Entrenamiento" color="#F59E0B" tasks={trnTasks} />
            )}
          </>
        )}

        {hasAny && (
          <section className="mt-6">
            <div className="text-[10px] font-bold tracking-wider uppercase mb-2" style={{ color: "var(--p-text-faint)" }}>
              ✍️ ¿Cómo te ha ido?
            </div>
            <PatientDailyLogForm
              initial={todayLog ? { fatigue: todayLog.fatigue, rpe: todayLog.rpe, sleep: todayLog.sleep } : null}
            />
            <div className="text-center mt-3">
              <Link href={`/paciente/${patient.id}/metricas`} className="text-xs underline" style={{ color: "var(--p-text-faint)" }}>
                Ver histórico de métricas →
              </Link>
            </div>
          </section>
        )}

        {!hasAny && (
          <section
            className="rounded-2xl p-5 text-center py-10"
            style={{ background: "var(--p-surface-2)", border: "1px solid var(--p-border)" }}
          >
            <div className="text-3xl mb-2">😴</div>
            <p className="text-sm" style={{ color: "var(--p-text-dim)" }}>
              No hay sesión programada para hoy.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

function SectionBlock({
  label, color, tasks,
}: {
  label: string;
  color: string;
  tasks: ResolvedTask[];
}) {
  return (
    <section className="mb-5">
      <div
        className="inline-flex items-center text-[10px] font-bold tracking-wider px-2 py-1 rounded mb-2"
        style={{ background: `${color}22`, color }}
      >
        {label.toUpperCase()}
      </div>
      <div className="space-y-2">
        {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
      </div>
    </section>
  );
}

function TaskCard({ task }: { task: ResolvedTask }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}>
      <div className="flex items-start gap-2 mb-1">
        <div className="text-lg">{TYPE_ICONS[task.type] || "•"}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base" style={{ letterSpacing: "-0.015em" }}>
            {task.title}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--p-text-faint)" }}>
            {TYPE_LABELS[task.type] || task.type}
          </div>
        </div>
      </div>
      {task.bodyText && (
        <div
          className="text-sm whitespace-pre-wrap mt-3 leading-relaxed"
          style={{ color: "var(--p-text-dim)" }}
        >
          {task.bodyText}
        </div>
      )}
      {task.youtubeUrl && (
        <a
          href={task.youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium mt-3 hover:underline"
          style={{ color: "var(--p-accent)" }}
        >
          Abrir vídeo →
        </a>
      )}
      {task.type === "WORKOUT" && (
        <TaskTimerButton taskTitle={task.title} taskBody={task.bodyText} />
      )}
      {task.exercises && task.exercises.length > 0 && (
        <RollingExerciseVideos exercises={task.exercises} />
      )}
    </div>
  );
}
