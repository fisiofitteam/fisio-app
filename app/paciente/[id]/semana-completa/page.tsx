import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, PlayCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { weekStartDate } from "@/lib/program-pauses";
import { resolveVisibleRollingWeek } from "@/lib/rolling-visible-week";
import { applyRollingOverridesToTasks, fetchOverridesForPatient } from "@/lib/apply-rolling-overrides";
import { PatientNav } from "@/components/PatientNav";
import { RollingWeekView } from "@/components/RollingWeekView";
import { buildAdvanceWeekView } from "@/lib/advance-week";

function summarizeTasks(tasks: Array<{ type: string; title: string }>): string {
  if (tasks.length === 0) return "";
  const titles = tasks.slice(0, 3).map((t) => t.title);
  return titles.join(" · ");
}

/**
 * Vista "Semana completa" del paciente ADVANCE. Muestra los 5 días L-V con
 * todas las tareas del rolling actual. Antes vivía en el home del paciente
 * pero la CEO pidió sacarlo a su propia pantalla para dejar el home más
 * ligero (solo CTA de hoy + grid de accesos).
 *
 * Reutiliza la misma consulta que app/paciente/[id]/page.tsx para asegurar
 * que ambos ven exactamente lo mismo.
 */
export default async function PatientSemanaCompletaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { view?: string };
}) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      programType: true,
      programMode: true,
      rollingAccessoriesId: true,
      rollingTrainingId: true,
      rollingProgramId: true,
    },
  });
  if (!patient) notFound();

  // Vista: "current" (esta semana) por defecto, "next" (semana siguiente).
  const view: "current" | "next" = searchParams.view === "next" ? "next" : "current";

  const isPrevention = patient.programType === "PREVENTION";
  // Prevention es single-rolling y usa el campo legacy rollingProgramId.
  // Advance usa acc + trn (con fallback al legacy si viene de rolling antiguo).
  const accId = isPrevention ? null : patient.rollingAccessoriesId;
  const trnId = isPrevention
    ? patient.rollingProgramId
    : (patient.rollingTrainingId || patient.rollingProgramId);
  const hasAnyRolling = Boolean(accId || trnId);

  // Si el paciente no está en rolling, no tiene sentido esta vista → home.
  if (patient.programMode !== "rolling" || !hasAnyRolling) {
    redirect(`/paciente/${patient.id}`);
  }

  // ─── ADVANCE: vista "Sesión 1..N" (sin días naturales, con selector de semana) ───
  if (patient.programType === "ADVANCE") {
    const nowAdv = new Date();
    // dow 1..7 (lunes=1) en la TZ del server (para el gate del viernes).
    const dowAdv = nowAdv.getDay() === 0 ? 7 : nowAdv.getDay();
    // La semana siguiente solo se muestra a partir del VIERNES. Antes de eso
    // el botón sigue visible pero pinta "Tu coach está preparando la semana".
    const nextLocked = view === "next" && dowAdv < 5;
    // Fecha objetivo para buildAdvanceWeekView (dentro de la semana elegida).
    const targetAt = view === "next"
      ? new Date(nowAdv.getTime() + 7 * 86400_000)
      : nowAdv;

    const week = nextLocked
      ? null
      : await buildAdvanceWeekView({
          id: patient.id,
          timezone: null, // usamos ahora sin TZ específica (buildAdvanceWeekView tolera null)
          rollingAccessoriesId: patient.rollingAccessoriesId,
          rollingTrainingId: patient.rollingTrainingId,
          rollingProgramId: patient.rollingProgramId,
        }, targetAt).catch(() => null);

    return (
      <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
        <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
          <header className="mb-5">
            <Link
              href={`/paciente/${patient.id}`}
              className="inline-flex items-center gap-1 text-xs mb-4"
              style={{ color: "var(--p-text-faint)" }}
            >
              <ArrowLeft size={12} /> Volver
            </Link>
            <div className="text-[10px] font-bold tracking-wider uppercase mb-1" style={{ color: "var(--p-text-faint)" }}>
              {view === "next" ? "Próxima semana" : "Mi semana"}
            </div>
            <h1 className="text-2xl font-bold" style={{ letterSpacing: "-0.03em" }}>
              {view === "next"
                ? "Semana siguiente"
                : week?.allCompleted
                  ? "🎉 ¡Semana completada!"
                  : `${week?.completedCount ?? 0}/${week?.totalCount ?? 0} sesiones`}
            </h1>
            <p className="text-xs mt-1" style={{ color: "var(--p-text-dim)" }}>
              {view === "next"
                ? "Aquí podrás ver lo que te toca la próxima semana."
                : "Marca cada sesión al terminarla. Intenta respetar el orden de las sesiones!"}
            </p>
          </header>

          {/* Selector "Esta semana / Semana siguiente" — el botón de siguiente
              siempre visible; antes del viernes muestra el gate. */}
          <div className="flex rounded-lg p-0.5 mb-4" style={{ background: "var(--p-surface-2)" }}>
            <Link
              href={`/paciente/${patient.id}/semana-completa`}
              className="flex-1 px-3 py-1.5 text-xs rounded-md text-center transition-colors font-medium"
              style={view === "current"
                ? { background: "var(--p-surface)", color: "var(--p-text)" }
                : { color: "var(--p-text-dim)" }}
            >
              Esta semana
            </Link>
            <Link
              href={`/paciente/${patient.id}/semana-completa?view=next`}
              className="flex-1 px-3 py-1.5 text-xs rounded-md text-center transition-colors font-medium"
              style={view === "next"
                ? { background: "var(--p-surface)", color: "var(--p-text)" }
                : { color: "var(--p-text-dim)" }}
            >
              Semana siguiente
            </Link>
          </div>

          {nextLocked ? (
            <section
              className="rounded-2xl p-5 text-center py-10"
              style={{ background: "var(--p-surface-2)", border: "1px solid var(--p-border)" }}
            >
              <div className="text-3xl mb-2">🛠️</div>
              <p className="text-sm" style={{ color: "var(--p-text-dim)" }}>
                Tu coach está preparando la semana.
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--p-text-faint)" }}>
                A partir del viernes podrás verla.
              </p>
            </section>
          ) : !week || week.sessions.length === 0 ? (
            <section
              className="rounded-2xl p-5 text-center py-10"
              style={{ background: "var(--p-surface-2)", border: "1px solid var(--p-border)" }}
            >
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm" style={{ color: "var(--p-text-dim)" }}>
                {view === "next"
                  ? "Aún no hay sesiones publicadas para la próxima semana."
                  : "Tu coach aún no ha programado sesiones para esta semana."}
              </p>
            </section>
          ) : (
            <div className="space-y-3">
              {week.sessions.map((s) => {
                // Sin sesiones bloqueadas: cualquiera pendiente se puede
                // hacer en cualquier orden. La "actual" (nextIndex) se
                // marca solo como sugerencia visual.
                const isCurrent = week.nextIndex === s.sessionIndex && !s.completed;
                const summary = summarizeTasks(s.tasks);
                const bg = s.completed
                  ? "var(--p-green-bg)"
                  : isCurrent
                    ? "linear-gradient(135deg, var(--p-accent) 0%, #F59E0B 100%)"
                    : "var(--p-surface)";
                const color = s.completed
                  ? "var(--p-green-text)"
                  : isCurrent
                    ? "var(--p-accent-ink)"
                    : "var(--p-text)";
                const border = s.completed
                  ? "1px solid var(--p-green-border)"
                  : isCurrent
                    ? "1px solid transparent"
                    : "1px solid var(--p-border)";
                // En la vista "next" las cards son sólo preview, no llevan
                // a /sesion-hoy — el atleta solo puede completar la semana
                // actual.
                const inner = (
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">
                      {s.completed ? <CheckCircle2 size={26} /> : <PlayCircle size={26} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold tracking-wider uppercase opacity-80">
                        Sesión {s.sessionIndex}
                      </div>
                      <div className="text-base font-semibold" style={{ letterSpacing: "-0.02em" }}>
                        {s.completed ? "Completada" : "Pendiente"}
                      </div>
                      {summary && (
                        <div className="text-[11px] mt-0.5 opacity-80 line-clamp-1">
                          {summary}
                        </div>
                      )}
                    </div>
                    {view === "current" && <div className="text-xl opacity-70">→</div>}
                  </div>
                );
                if (view === "next") {
                  return (
                    <div
                      key={s.sessionIndex}
                      className="rounded-2xl p-4"
                      style={{ background: bg, color, border }}
                    >
                      {inner}
                    </div>
                  );
                }
                return (
                  <Link
                    key={s.sessionIndex}
                    href={`/paciente/${patient.id}/sesion-hoy?session=${s.sessionIndex}`}
                    className="block rounded-2xl p-4 transition-transform active:scale-[0.98]"
                    style={{ background: bg, color, border }}
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          )}

          <PatientNav patientId={patient.id} active="semana" variant="advance" />
        </div>
      </main>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay() === 0 ? 7 : today.getDay(); // 1..7 (L=1)
  const thisMonday = weekStartDate(today);
  // Base para la vista "next": mismo dia (lunes) + 7. resolveVisibleRollingWeek
  // buscará la semana que empieza en esa fecha.
  const nextMonday = new Date(thisMonday.getTime() + 7 * 86400000);
  const targetMonday = view === "next" ? nextMonday : thisMonday;
  // Regla pedida: la semana siguiente NO se muestra hasta el VIERNES.
  // Antes de eso (dow < 5), incluso si el coach ya publicó, la vista de
  // "próxima" queda como "preparando la semana" para no adelantar spoilers
  // ni desviar la atención de la semana actual.
  const nextWeekLocked = view === "next" && dow < 5;

  const fetchWeek = (programId: string | null) =>
    resolveVisibleRollingWeek<any>(programId, targetMonday, {
      days: {
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
        orderBy: { dayOfWeek: "asc" },
      },
    });
  const [accWeek, trnWeek, overrides] = await Promise.all([
    fetchWeek(accId),
    fetchWeek(trnId),
    fetchOverridesForPatient(patient.id),
  ]);
  // Aplica overrides individuales del atleta a las tareas de cada día.
  if (accWeek) accWeek.days = accWeek.days.map((d: any) => ({ ...d, tasks: applyRollingOverridesToTasks(d.tasks, overrides as any) }));
  if (trnWeek) trnWeek.days = trnWeek.days.map((d: any) => ({ ...d, tasks: applyRollingOverridesToTasks(d.tasks, overrides as any) }));

  // Vídeos referenciados en las tareas
  const allTasksFlat = [
    ...(accWeek?.days.flatMap((d: any) => d.tasks) || []),
    ...(trnWeek?.days.flatMap((d: any) => d.tasks) || []),
  ];
  const videoIds = new Set<string>();
  for (const t of allTasksFlat) {
    if ((t.type === "VIDEO" || t.type === "WORKOUT") && t.videoId) videoIds.add(t.videoId);
  }
  let videosById: Record<string, { youtubeUrl: string; title: string }> = {};
  if (videoIds.size > 0) {
    const vids = await prisma.videoLibrary.findMany({
      where: { id: { in: Array.from(videoIds) } },
    });
    for (const v of vids) {
      videosById[v.id] = { youtubeUrl: v.youtubeUrl, title: v.title };
    }
  }

  type ResolvedExercise = { id: string; name: string; category: string; youtubeUrl: string | null; description: string | null };
  type Block = {
    blockLabel: string;
    blockColor: string;
    title: string | null;
    published: boolean;
    days: Array<{
      dayOfWeek: number;
      tasks: Array<{ id: string; type: string; title: string; bodyText: string | null; youtubeUrl: string | null; exercises: ResolvedExercise[] }>;
    }>;
  };
  const mapTask = (t: any) => ({
    id: t.id,
    type: t.type,
    title: t.title,
    bodyText: t.bodyText,
    youtubeUrl: t.videoId ? videosById[t.videoId]?.youtubeUrl ?? null : null,
    exercises: (t.exercises ?? []).map((we: any) => ({
      id: we.exercise.id,
      name: we.exercise.name,
      category: we.exercise.category,
      youtubeUrl: we.exercise.youtubeUrl,
      description: we.exercise.description,
    })) as ResolvedExercise[],
  });
  const blocks: Block[] = [];
  if (isPrevention) {
    // Prevention: un solo tramo de contenido sin etiqueta de bloque.
    if (trnWeek) {
      blocks.push({
        blockLabel: "", // sin chip visible en la tarea
        blockColor: "#FCD34D",
        title: trnWeek.title || null,
        published: Boolean(trnWeek.publishedAt),
        days: trnWeek.days.map((d: any) => ({ dayOfWeek: d.dayOfWeek, tasks: d.tasks.map(mapTask) })),
      });
    }
  } else {
    if (accId && accWeek) {
      blocks.push({
        blockLabel: "Accesorios",
        blockColor: "#3B82F6",
        title: accWeek.title || null,
        published: Boolean(accWeek.publishedAt),
        days: accWeek.days.map((d: any) => ({ dayOfWeek: d.dayOfWeek, tasks: d.tasks.map(mapTask) })),
      });
    }
    if (trnId && trnWeek) {
      blocks.push({
        blockLabel: "Entrenamiento",
        blockColor: "#F59E0B",
        title: trnWeek.title || null,
        published: Boolean(trnWeek.publishedAt),
        days: trnWeek.days.map((d: any) => ({ dayOfWeek: d.dayOfWeek, tasks: d.tasks.map(mapTask) })),
      });
    }
  }

  const anyPublished = blocks.some((b) => b.published);
  const daysByDow: Record<number, Array<{ id: string; type: string; title: string; bodyText: string | null; youtubeUrl: string | null; exercises: ResolvedExercise[]; blockLabel: string; blockColor: string }>> = {};
  for (let dow = 1; dow <= 5; dow++) daysByDow[dow] = [];
  for (const b of blocks) {
    if (!b.published) continue;
    for (const d of b.days) {
      for (const t of d.tasks) {
        daysByDow[d.dayOfWeek].push({ ...t, blockLabel: b.blockLabel, blockColor: b.blockColor });
      }
    }
  }
  const flatDays = [1, 2, 3, 4, 5].map((dow) => ({ dayOfWeek: dow, tasks: daysByDow[dow] }));
  const headerTitle = (trnWeek?.title || accWeek?.title) || null;

  // Fecha real de la semana visible: si la actual está publicada usamos
  // thisMonday; si no y estamos viendo una futura, usamos su weekStartDate
  // para que el header refleje la semana real que ve el atleta.
  const visibleWeekStart: Date =
    (trnWeek?.weekStartDate as Date | undefined) ??
    (accWeek?.weekStartDate as Date | undefined) ??
    thisMonday;

  return (
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        <header className="mb-5">
          <Link
            href={`/paciente/${patient.id}`}
            className="inline-flex items-center gap-1 text-xs mb-4"
            style={{ color: "var(--p-text-faint)" }}
          >
            <ArrowLeft size={12} /> Volver
          </Link>
          <h1 className="text-2xl font-bold" style={{ letterSpacing: "-0.03em" }}>
            📅 Semana completa
          </h1>
        </header>

        {/* Selector Esta semana / Semana siguiente — siempre visible.
             La siguiente solo revela contenido a partir del viernes; antes
             muestra "tu coach está preparando la semana" (incluso si el
             coach ya la publicó). */}
        <div className="flex rounded-lg p-0.5 mb-5" style={{ background: "var(--p-surface-2)" }}>
          <Link
            href={`/paciente/${patient.id}/semana-completa`}
            className="flex-1 px-3 py-1.5 text-xs rounded-md text-center transition-colors font-medium"
            style={
              view === "current"
                ? { background: "var(--p-accent)", color: "var(--p-accent-ink)" }
                : { color: "var(--p-text-dim)" }
            }
          >
            Esta semana
          </Link>
          <Link
            href={`/paciente/${patient.id}/semana-completa?view=next`}
            className="flex-1 px-3 py-1.5 text-xs rounded-md text-center transition-colors font-medium"
            style={
              view === "next"
                ? { background: "var(--p-accent)", color: "var(--p-accent-ink)" }
                : { color: "var(--p-text-dim)" }
            }
          >
            Semana siguiente →
          </Link>
        </div>

        <RollingWeekView
          mode={nextWeekLocked ? "pending" : (anyPublished ? "ready" : "pending")}
          weekStartIso={(view === "next" ? nextMonday : visibleWeekStart).toISOString()}
          title={nextWeekLocked ? null : headerTitle}
          days={nextWeekLocked ? [] : flatDays}
        />
      </div>
      <PatientNav patientId={patient.id} active="semana" variant={isPrevention ? "prevention" : "advance"} />
    </main>
  );
}
