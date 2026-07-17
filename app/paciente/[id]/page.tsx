import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientHomeDark } from "@/components/PatientHomeDark";
import { PatientHomeRolling } from "@/components/PatientHomeRolling";
import { PatientHomePrevention } from "@/components/PatientHomePrevention";
import { calculateAdherence } from "@/lib/adherence";
import { getPauseSnapshot, weekStartDate } from "@/lib/program-pauses";
import { getWelcomeConfig } from "@/lib/welcome-config";
import { pickWelcomeMessage } from "@/lib/welcome-content";
import { applyVars } from "@/lib/landing-content";
import { ensurePreventionRollingProgram } from "@/lib/prevention";
import { resolveVisibleRollingWeek } from "@/lib/rolling-visible-week";
import { applyRollingOverridesToTasks, fetchOverridesForPatient } from "@/lib/apply-rolling-overrides";
import { getPendingFormsForPatient } from "@/lib/pending-forms";
import { todayForPatient, weekStartForPatient } from "@/lib/patient-dates";

export default async function PatientHome({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: { appliedLevel: { include: { profile: true } } },
  });
  if (!patient) notFound();

  const firstName = patient.fullName.split(" ")[0];
  // Formularios pendientes por rellenar. Persisten aunque la sesión haya
  // pasado de día — el banner del home los recuerda hasta que se rellenan.
  const pendingForms = await getPendingFormsForPatient(patient.id).catch(() => []);

  // Snapshot de pausas — antes redirigíamos a PatientHomePaused si había
  // una activa, pero ahora el paciente conserva acceso normal para hacer
  // el trabajo sustitutivo. El aviso persistente vive en el layout como
  // banner azul en la parte de arriba de todas las pantallas.
  const pauseSnapshot = await getPauseSnapshot(patient.id);

  // --- 2a. Si es PREVENTION → vista dedicada de suscriptor ---
  // Prevention es una suscripción low-ticket recurrente con UN SOLO rolling
  // (equivalente a los accesorios de ADVANCE). El paciente no tiene fisio
  // asignado ni ve PRs.
  if (patient.programType === "PREVENTION" && patient.programMode === "rolling") {
    // "Hoy" y el lunes-de-esta-semana calculados en la TZ del paciente —
    // sin esto un paciente en Colombia veria "hoy" de Madrid.
    const today = todayForPatient(patient.timezone);
    const thisMonday = weekStartForPatient(patient.timezone);
    // Auto-heal: si el paciente Prevention no está enlazado a un rolling
    // (ej. pacientes creados antes de este fix, o el programa Prevention
    // se creó después del alta), le asignamos el primer activo aquí en
    // lectura para que el home muestre contenido sin necesidad de que la
    // CEO intervenga manualmente.
    const preventionRollingId =
      patient.rollingProgramId
      ?? patient.rollingAccessoriesId
      ?? patient.rollingTrainingId
      ?? (await ensurePreventionRollingProgram(patient.id));

    // Fecha de fin de suscripción para avisos discretos de renovación
    const activeSub = await prisma.patientSubscription.findFirst({
      where: {
        patientId: patient.id,
        productType: "prevention",
        status: { in: ["scheduled", "trialing", "active", "past_due"] },
      },
      orderBy: { createdAt: "desc" },
      select: { status: true, currentPeriodEnd: true, trialEndsAt: true, cancelAtPeriodEnd: true },
    });
    const relevantEnd = activeSub?.status === "trialing"
      ? activeSub.trialEndsAt
      : activeSub?.currentPeriodEnd;
    // Normalizamos ambas fechas a medianoche para contar días de
    // calendario y evitar off-by-one por horas (ej. trialEndsAt suele
    // ser now+4d con la hora del pago, y `today` está a las 00:00 →
    // Math.round redondea a 5 cuando debería ser 4).
    const daysToRenewal = relevantEnd
      ? (() => {
          const end = new Date(relevantEnd);
          end.setHours(0, 0, 0, 0);
          return Math.round((end.getTime() - today.getTime()) / 86400000);
        })()
      : null;

    // Semana visible del rolling Prevention: la actual si está publicada,
    // si no la próxima publicada (fallback anti "no hay contenido").
    const week: any = await resolveVisibleRollingWeek(preventionRollingId, thisMonday, {
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

    // Vídeos referenciados (para tareas VIDEO/WORKOUT con videoId)
    const videoIds = new Set<string>();
    for (const d of (week?.days ?? []) as any[]) {
      for (const t of d.tasks) {
        if ((t.type === "VIDEO" || t.type === "WORKOUT") && t.videoId) videoIds.add(t.videoId);
      }
    }
    const videosById: Record<string, { youtubeUrl: string }> = {};
    if (videoIds.size > 0) {
      const vids = await prisma.videoLibrary.findMany({ where: { id: { in: Array.from(videoIds) } } });
      for (const v of vids) videosById[v.id] = { youtubeUrl: v.youtubeUrl };
    }

    // Aplanar días (sin split de bloques — Prevention es un tramo único)
    const flatDays = [1, 2, 3, 4, 5].map((dow) => {
      const day = week?.days.find((d: any) => d.dayOfWeek === dow);
      const tasks = (day?.tasks ?? []).map((t: any) => ({
        id: t.id,
        type: t.type,
        title: t.title,
        bodyText: t.bodyText,
        youtubeUrl: t.videoId ? videosById[t.videoId]?.youtubeUrl ?? null : null,
      }));
      return { dayOfWeek: dow, tasks };
    });

    // Reto del mes + comunidad unread (misma que Advance)
    const nowP = new Date();
    const sinceP = patient.communityLastSeenAt ?? patient.startedAt ?? new Date(0);
    const [preventionNewPosts, preventionNewComments, preventionNewReactions, currentChallengeP] = await Promise.all([
      prisma.communityFeedPost.count({
        where: { published: true, createdAt: { gt: sinceP }, NOT: { patientAuthorId: patient.id } },
      }),
      prisma.communityComment.count({
        where: { createdAt: { gt: sinceP }, post: { patientAuthorId: patient.id }, NOT: { patientId: patient.id } },
      }),
      prisma.communityReaction.count({
        where: { createdAt: { gt: sinceP }, post: { patientAuthorId: patient.id }, NOT: { patientId: patient.id } },
      }),
      prisma.monthlyChallenge.findUnique({
        where: { year_month: { year: nowP.getFullYear(), month: nowP.getMonth() } },
      }).catch(() => null),
    ]);
    const preventionUnread = preventionNewPosts + preventionNewComments + preventionNewReactions;

    return (
      <PatientHomePrevention
        firstName={firstName}
        patientId={patient.id}
        patientPhotoUrl={patient.photoUrl}
        communityUnread={preventionUnread}
        challenge={currentChallengeP ? {
          id: currentChallengeP.id,
          title: currentChallengeP.title,
          description: currentChallengeP.description,
        } : null}
        mode={week?.publishedAt ? "ready" : "pending"}
        weekStartIso={(week?.weekStartDate ?? thisMonday).toISOString()}
        weekTitle={week?.title ?? null}
        days={flatDays}
        daysToRenewal={daysToRenewal}
        subscriptionStatus={activeSub?.status ?? null}
        cancelAtPeriodEnd={activeSub?.cancelAtPeriodEnd ?? false}
      />
    );
  }

  // --- 2. Si es ADVANCE rolling → vista de programa rolling ---
  // Determinar IDs de los Rollings asignados (accesorios + entrenamiento + fallback legacy)
  const accId = patient.rollingAccessoriesId;
  const trnId = patient.rollingTrainingId || patient.rollingProgramId; // fallback al legacy
  const hasAnyRolling = Boolean(accId || trnId);

  if (patient.programMode === "rolling" && hasAnyRolling) {
    const today = todayForPatient(patient.timezone);
    const thisMonday = weekStartForPatient(patient.timezone);

    // Calcular fecha de fin de suscripción (para avisos de caducidad)
    const subEnd = patient.subscriptionStartDate
      ? (() => {
          const e = new Date(patient.subscriptionStartDate);
          e.setMonth(e.getMonth() + patient.subscriptionPeriodMonths);
          return e;
        })()
      : null;
    const daysToExpire = subEnd ? Math.round((subEnd.getTime() - today.getTime()) / 86400000) : null;

    // Si ya caducó, no le dejamos ver el programa
    if (daysToExpire !== null && daysToExpire < 0) {
      return (
        <PatientHomeRolling
          firstName={firstName}
          patientId={patient.id}
          mode="expired"
          weekStartIso={thisMonday.toISOString()}
          days={[]}
        />
      );
    }

    // Semana visible por rolling: la actual si está publicada; si no, la
    // próxima publicada. Así el atleta ve el "avance" cuando el CEO ha
    // programado con antelación pero aún no toca esta semana.
    const fetchWeek = (programId: string | null) =>
      resolveVisibleRollingWeek<any>(programId, thisMonday, {
        days: {
          include: { tasks: { orderBy: { order: "asc" } } },
          orderBy: { dayOfWeek: "asc" },
        },
      });

    // Sesión individual de HOY (si el atleta ADVANCE tiene además un
    // ProgramAssignment activo — "trabajo específico" además del rolling).
    // Rango "hoy" calculado en la TZ del paciente (UTC midnight → +1 día).
    const todayUtc = todayForPatient(patient.timezone);
    const tomorrowUtc = new Date(todayUtc);
    tomorrowUtc.setUTCDate(todayUtc.getUTCDate() + 1);
    // Buscamos TODAS las sesiones individuales de HOY (varios assignments
    // = varias sesiones el mismo día). Antes usábamos findFirst y solo se
    // veía la primera en el header morado.
    const individualSessionsTodayPromise = prisma.programSession.findMany({
      where: {
        assignment: { patientId: patient.id, isActive: true },
        scheduledDate: { gte: todayUtc, lt: tomorrowUtc },
      },
      include: { assignment: { include: { program: { select: { name: true } } } } },
      orderBy: { scheduledDate: "asc" },
    }).catch(() => [] as any[]);

    // ¿El atleta tiene ProgramAssignments activos? Se usa para decidir si
    // mostrar la tarjeta "Trabajo específico" en el grid de accesos.
    const hasIndividualWorkPromise = prisma.programAssignment.count({
      where: { patientId: patient.id, isActive: true },
    }).then((n) => n > 0).catch(() => false);

    const [accWeek, trnWeek, patientOverrides, individualSessionsToday, hasIndividualWork] = await Promise.all([
      fetchWeek(accId),
      fetchWeek(trnId),
      fetchOverridesForPatient(patient.id),
      individualSessionsTodayPromise,
      hasIndividualWorkPromise,
    ]);
    // Aplica overrides individuales del atleta a las tareas de cada día del rolling.
    if (accWeek) accWeek.days = accWeek.days.map((d: any) => ({ ...d, tasks: applyRollingOverridesToTasks(d.tasks, patientOverrides as any) }));
    if (trnWeek) trnWeek.days = trnWeek.days.map((d: any) => ({ ...d, tasks: applyRollingOverridesToTasks(d.tasks, patientOverrides as any) }));

    // Resolver vídeos referenciados de ambos rollings
    let videosById: Record<string, { youtubeUrl: string; title: string }> = {};
    const allTasksFlat = [
      ...(accWeek?.days.flatMap((d: any) => d.tasks) || []),
      ...(trnWeek?.days.flatMap((d: any) => d.tasks) || []),
    ];
    const videoIds = new Set<string>();
    for (const t of allTasksFlat) {
      if ((t.type === "VIDEO" || t.type === "WORKOUT") && t.videoId) videoIds.add(t.videoId);
    }
    if (videoIds.size > 0) {
      const vids = await prisma.videoLibrary.findMany({
        where: { id: { in: Array.from(videoIds) } },
      });
      for (const v of vids) {
        videosById[v.id] = { youtubeUrl: v.youtubeUrl, title: v.title };
      }
    }

    // Construir lista de bloques: cada bloque es un Rolling (accesorios o entrenamiento)
    // con sus 5 días y sus tareas. El componente PatientHomeRolling sabe pintar varios.
    type Block = {
      blockLabel: string; // "Accesorios" / "Entrenamiento"
      blockColor: string; // color de la pastilla
      title: string | null; // título de la semana
      published: boolean;
      days: Array<{
        dayOfWeek: number;
        tasks: Array<{
          id: string;
          type: string;
          title: string;
          bodyText: string | null;
          youtubeUrl: string | null;
        }>;
      }>;
    };

    const blocks: Block[] = [];
    if (accId && accWeek) {
      blocks.push({
        blockLabel: "Accesorios",
        blockColor: "#3B82F6", // azul
        title: accWeek.title || null,
        published: Boolean(accWeek.publishedAt),
        days: accWeek.days.map((d: any) => ({
          dayOfWeek: d.dayOfWeek,
          tasks: d.tasks.map((t: any) => ({
            id: t.id,
            type: t.type,
            title: t.title,
            bodyText: t.bodyText,
            youtubeUrl: t.videoId ? videosById[t.videoId]?.youtubeUrl ?? null : null,
          })),
        })),
      });
    }
    if (trnId && trnWeek) {
      blocks.push({
        blockLabel: "Entrenamiento",
        blockColor: "#F59E0B", // ámbar
        title: trnWeek.title || null,
        published: Boolean(trnWeek.publishedAt),
        days: trnWeek.days.map((d: any) => ({
          dayOfWeek: d.dayOfWeek,
          tasks: d.tasks.map((t: any) => ({
            id: t.id,
            type: t.type,
            title: t.title,
            bodyText: t.bodyText,
            youtubeUrl: t.videoId ? videosById[t.videoId]?.youtubeUrl ?? null : null,
          })),
        })),
      });
    }

    // Si todos los bloques están en borrador → "pending". Si al menos uno está publicado → "ready"
    const anyPublished = blocks.some((b) => b.published);
    // Mantenemos compat con el formato anterior: aplanar todos los bloques en 5 días L-V
    // pero marcando cada tarea con su blockLabel.
    const daysByDow: Record<number, Array<{ id: string; type: string; title: string; bodyText: string | null; youtubeUrl: string | null; blockLabel: string; blockColor: string }>> = {};
    for (let dow = 1; dow <= 5; dow++) daysByDow[dow] = [];
    for (const b of blocks) {
      if (!b.published) continue; // solo mostrar bloques publicados
      for (const d of b.days) {
        for (const t of d.tasks) {
          daysByDow[d.dayOfWeek].push({
            ...t,
            blockLabel: b.blockLabel,
            blockColor: b.blockColor,
          });
        }
      }
    }
    const flatDays = [1, 2, 3, 4, 5].map((dow) => ({ dayOfWeek: dow, tasks: daysByDow[dow] }));

    // Título: usar el del entrenamiento si hay, si no el de accesorios
    const headerTitle = (trnWeek?.title || accWeek?.title) || null;

    // ── Datos para el nuevo panel ADVANCE rolling ──────────────────────────
    const nowR = new Date();
    const sinceR = patient.communityLastSeenAt ?? patient.startedAt ?? new Date(0);
    const [rolledNewPosts, rolledNewComments, rolledNewReactions, currentChallenge] = await Promise.all([
      prisma.communityFeedPost.count({
        where: { published: true, createdAt: { gt: sinceR }, NOT: { patientAuthorId: patient.id } },
      }),
      prisma.communityComment.count({
        where: { createdAt: { gt: sinceR }, post: { patientAuthorId: patient.id }, NOT: { patientId: patient.id } },
      }),
      prisma.communityReaction.count({
        where: { createdAt: { gt: sinceR }, post: { patientAuthorId: patient.id }, NOT: { patientId: patient.id } },
      }),
      // Si la tabla aún no se ha migrado (Neon), no rompemos: simplemente no
      // mostramos el reto del mes hasta que llegue la columna.
      prisma.monthlyChallenge.findUnique({
        where: { year_month: { year: nowR.getFullYear(), month: nowR.getMonth() } },
      }).catch(() => null),
    ]);
    const rollingUnread = rolledNewPosts + rolledNewComments + rolledNewReactions;

    return (
      <PatientHomeRolling
        firstName={firstName}
        patientId={patient.id}
        patientPhotoUrl={patient.photoUrl}
        whatsappGroupUrl={patient.whatsappGroupUrl}
        communityUnread={rollingUnread}
        programType={patient.programType}
        challenge={currentChallenge ? {
          id: currentChallenge.id,
          title: currentChallenge.title,
          description: currentChallenge.description,
        } : null}
        mode={anyPublished ? "ready" : "pending"}
        weekStartIso={((trnWeek?.weekStartDate ?? accWeek?.weekStartDate ?? thisMonday) as Date).toISOString()}
        title={headerTitle}
        days={flatDays}
        daysToExpire={daysToExpire}
        // Pacientes migrados (giftsAlreadySent=true) ya tienen su camiseta
        // de antes y no deben ver el selector.
        needsShirtSize={patient.programType === "ADVANCE" && !patient.shirtSize && !patient.giftsAlreadySent}
        shippingComplete={!!(patient.shippingStreet && patient.shippingNumber && patient.shippingCity && patient.shippingPostalCode)}
        individualSessionsToday={individualSessionsToday.length > 0 ? {
          count: individualSessionsToday.length,
          allCompleted: individualSessionsToday.every((s: any) => !!s.completedAt),
          // Si solo hay 1, el link puede ir directo a esa sesión; si hay
          // varias, dejamos que /sesion-combinada-hoy decida (redirige a
          // esa sesión si es 1 sola, o pinta CombinedSessionRunner si más).
          singleSessionId: individualSessionsToday.length === 1 ? individualSessionsToday[0].id : null,
        } : null}
        hasIndividualWork={hasIndividualWork}
        pendingForms={pendingForms}
      />
    );
  }

  // --- 3. Vista normal (programa fijo) ---
  const adherence = await calculateAdherence(patient.id);

  // Índice estable por assignment (para el color rotativo verde /
  // amarillo / violeta / naranja de cada programa asignado).
  const allActiveAssignments = await prisma.programAssignment.findMany({
    where: { patientId: patient.id, isActive: true },
    select: { id: true, startDate: true },
    orderBy: { startDate: "asc" },
  });
  const assignmentIndexEntries: Array<[string, number]> = allActiveAssignments.map((a, i) => [a.id, i]);

  // "Hoy" en la TZ del paciente. Un paciente en Bogotá a las 3am (10am Madrid)
  // sigue viendo "hoy" como el mismo día que él, no el que aparece en Madrid.
  const today = todayForPatient(patient.timezone);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(today.getUTCDate() + 1);

  const todaySessions = await prisma.programSession.findMany({
    where: {
      assignment: { patientId: patient.id, isActive: true },
      scheduledDate: { gte: today, lt: tomorrow },
    },
    include: { assignment: { include: { program: true } } },
    orderBy: { scheduledDate: "asc" },
  });

  let nextSession = null;
  if (todaySessions.length === 0) {
    nextSession = await prisma.programSession.findFirst({
      where: {
        assignment: { patientId: patient.id, isActive: true },
        scheduledDate: { gte: tomorrow },
      },
      include: { assignment: { include: { program: true } } },
      orderBy: { scheduledDate: "asc" },
    });
  }

  // Si hay una pausa programada (futura), avisamos en el dashboard
  const upcomingPause = pauseSnapshot.upcomingPause;

  // Notificaciones persistentes (vacaciones de fisio, etc)
  const notifications = await prisma.patientNotification.findMany({
    where: { patientId: patient.id, readAt: null },
    orderBy: { createdAt: "asc" },
  });

  // Mensaje de bienvenida (editable por CEO, varía por programa y semanas en programa)
  const welcomeStart = patient.subscriptionStartDate ?? patient.programStartDate ?? patient.startedAt;
  const daysInProgram = welcomeStart
    ? Math.max(0, Math.floor((Date.now() - new Date(welcomeStart).getTime()) / 86400000))
    : 0;
  const weeksInProgram = Math.floor(daysInProgram / 7);
  const welcomeConfig = await getWelcomeConfig();
  const pickedWelcome = pickWelcomeMessage(welcomeConfig, { programType: patient.programType, weeksInProgram });
  const welcomeVars = {
    nombre: firstName,
    semanas: String(weeksInProgram),
    meses: String(Math.floor(daysInProgram / 30)),
    programa: patient.programType ?? "",
  };
  const welcomeLine1 = applyVars(pickedWelcome.line1, welcomeVars);
  const welcomeLine2 = applyVars(pickedWelcome.line2, welcomeVars);

  // ── Badge de novedades de la comunidad ─────────────────────────────────
  // Cuenta: posts publicados, comentarios y likes en SUS posts desde la última
  // vez que abrió la pestaña de Comunidad. Cuando entra, se actualiza la fecha.
  const since = patient.communityLastSeenAt ?? patient.startedAt ?? new Date(0);
  const [newPostsCount, newCommentsCount, newReactionsCount] = await Promise.all([
    prisma.communityFeedPost.count({
      where: {
        published: true,
        createdAt: { gt: since },
        // No contamos sus propios posts
        NOT: { patientAuthorId: patient.id },
      },
    }),
    prisma.communityComment.count({
      where: {
        createdAt: { gt: since },
        post: { patientAuthorId: patient.id },
        // No contamos sus propios comentarios
        NOT: { patientId: patient.id },
      },
    }),
    prisma.communityReaction.count({
      where: {
        createdAt: { gt: since },
        post: { patientAuthorId: patient.id },
        NOT: { patientId: patient.id },
      },
    }),
  ]);
  const communityUnread = newPostsCount + newCommentsCount + newReactionsCount;

  // Días para el fin del programa fijo (RECUPERA/CONSOLIDA). Si quedan pocos,
  // el home muestra un banner de upsell a Prevention como "siguiente paso".
  //
  // Fuente de verdad: `SubscriptionRenewal.endDate` del periodo activo, que
  // YA incluye extensiones por pausas del paciente y vacaciones del fisio
  // (lo actualiza extendSubscriptionByDays en /api/program-pauses). Antes
  // calculábamos desde subscriptionStartDate + subscriptionPeriodMonths, que
  // solo se actualiza en múltiplos de 30 días — pausas cortas se perdían.
  const activeRenewal = patient.subscriptionStartDate
    ? await prisma.subscriptionRenewal.findFirst({
        where: { patientId: patient.id, status: "active" },
        orderBy: { startDate: "desc" },
        select: { endDate: true },
      }).catch(() => null)
    : null;
  const programEndsInDays = (() => {
    if (!patient.subscriptionStartDate) return null;
    const end = activeRenewal?.endDate
      ? new Date(activeRenewal.endDate)
      : (() => {
          const e = new Date(patient.subscriptionStartDate!);
          e.setMonth(e.getMonth() + (patient.subscriptionPeriodMonths ?? 0));
          return e;
        })();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.round((end.getTime() - today.getTime()) / 86400000);
  })();

  return (
    <PatientHomeDark
      assignmentIndexEntries={assignmentIndexEntries}
      welcomeLine1={welcomeLine1}
      welcomeLine2={welcomeLine2}
      programEndsInDays={programEndsInDays}
      patient={{
        id: patient.id,
        firstName,
        programType: patient.programType,
        difficulty: patient.difficulty,
        appliedLevelName: patient.appliedLevel
          ? `${patient.appliedLevel.profile.name} · ${patient.appliedLevel.name}`
          : null,
        whatsappGroupUrl: patient.whatsappGroupUrl,
        photoUrl: patient.photoUrl,
        shippingComplete: !!(patient.shippingStreet && patient.shippingNumber && patient.shippingCity && patient.shippingPostalCode),
        communityUnread,
      }}
      todaySessions={todaySessions.map((s) => ({
        id: s.id,
        programName: s.assignment.program.name,
        completed: s.completedAt !== null,
        tasksCount: (JSON.parse(s.tasksSnapshot) as any[]).length,
        tasksSnapshot: s.tasksSnapshot,
        assignmentId: s.assignmentId,
      }))}
      nextSession={
        nextSession
          ? {
              id: nextSession.id,
              date: nextSession.scheduledDate.toISOString(),
              programName: nextSession.assignment.program.name,
              tasksCount: (JSON.parse(nextSession.tasksSnapshot) as any[]).length,
              tasksSnapshot: nextSession.tasksSnapshot,
              assignmentId: nextSession.assignmentId,
            }
          : null
      }
      adherence={adherence.total > 0 ? {
        completed: adherence.completed,
        total: adherence.total,
        percentage: Math.round((adherence.completed / adherence.total) * 100),
      } : null}
      upcomingPause={upcomingPause ? {
        startDate: upcomingPause.startDate.toISOString(),
        endDate: upcomingPause.endDate.toISOString(),
      } : null}
      notifications={notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
      }))}
      pendingForms={pendingForms}
    />
  );
}
