import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientHomeDark } from "@/components/PatientHomeDark";
import { PatientHomePaused } from "@/components/PatientHomePaused";
import { PatientHomeRolling } from "@/components/PatientHomeRolling";
import { PatientHomePrevention } from "@/components/PatientHomePrevention";
import { calculateAdherence } from "@/lib/adherence";
import { getPauseSnapshot, weekStartDate } from "@/lib/program-pauses";
import { getWelcomeConfig } from "@/lib/welcome-config";
import { pickWelcomeMessage } from "@/lib/welcome-content";
import { applyVars } from "@/lib/landing-content";

export default async function PatientHome({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: { appliedLevel: { include: { profile: true } } },
  });
  if (!patient) notFound();

  const firstName = patient.fullName.split(" ")[0];

  // --- 1. Si está pausado → vista de pausa con countdown ---
  const pauseSnapshot = await getPauseSnapshot(patient.id);
  if (pauseSnapshot.isPaused && pauseSnapshot.activePause) {
    return (
      <PatientHomePaused
        firstName={firstName}
        endDate={pauseSnapshot.activePause.endDate.toISOString()}
        daysRemaining={pauseSnapshot.activePause.daysRemaining}
        reason={pauseSnapshot.activePause.reason}
      />
    );
  }

  // --- 2a. Si es PREVENTION → vista dedicada de suscriptor ---
  // Prevention es una suscripción low-ticket recurrente con UN SOLO rolling
  // (equivalente a los accesorios de ADVANCE). El paciente no tiene fisio
  // asignado, no ve PRs y en el header aparece el CTA "Consultar con un fisio".
  if (patient.programType === "PREVENTION" && patient.programMode === "rolling") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonday = weekStartDate(today);
    const preventionRollingId =
      patient.rollingProgramId ?? patient.rollingAccessoriesId ?? patient.rollingTrainingId;

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
    const daysToRenewal = relevantEnd
      ? Math.round((new Date(relevantEnd).getTime() - today.getTime()) / 86400000)
      : null;

    // Semana del rolling Prevention (si hay una asignada y publicada)
    const week = preventionRollingId
      ? await prisma.rollingWeek.findUnique({
          where: { programId_weekStartDate: { programId: preventionRollingId, weekStartDate: thisMonday } },
          include: {
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
          },
        })
      : null;

    // Vídeos referenciados (para tareas VIDEO/WORKOUT con videoId)
    const videoIds = new Set<string>();
    for (const d of week?.days ?? []) {
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
      const day = week?.days.find((d) => d.dayOfWeek === dow);
      const tasks = (day?.tasks ?? []).map((t) => ({
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
        weekStartIso={thisMonday.toISOString()}
        weekTitle={week?.title ?? null}
        days={flatDays}
        daysToRenewal={daysToRenewal}
        subscriptionStatus={activeSub?.status ?? null}
        cancelAtPeriodEnd={activeSub?.cancelAtPeriodEnd ?? false}
        shippingComplete={!!(patient.shippingStreet && patient.shippingNumber && patient.shippingCity && patient.shippingPostalCode)}
      />
    );
  }

  // --- 2. Si es ADVANCE rolling → vista de programa rolling ---
  // Determinar IDs de los Rollings asignados (accesorios + entrenamiento + fallback legacy)
  const accId = patient.rollingAccessoriesId;
  const trnId = patient.rollingTrainingId || patient.rollingProgramId; // fallback al legacy
  const hasAnyRolling = Boolean(accId || trnId);

  if (patient.programMode === "rolling" && hasAnyRolling) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonday = weekStartDate(today);

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

    // Cargar la semana de cada rolling asignado (accesorios y/o entrenamiento)
    const fetchWeek = async (programId: string | null) => {
      if (!programId) return null;
      return prisma.rollingWeek.findUnique({
        where: { programId_weekStartDate: { programId, weekStartDate: thisMonday } },
        include: {
          days: {
            include: { tasks: { orderBy: { order: "asc" } } },
            orderBy: { dayOfWeek: "asc" },
          },
        },
      });
    };

    const [accWeek, trnWeek] = await Promise.all([fetchWeek(accId), fetchWeek(trnId)]);

    // Resolver vídeos referenciados de ambos rollings
    let videosById: Record<string, { youtubeUrl: string; title: string }> = {};
    const allTasksFlat = [
      ...(accWeek?.days.flatMap((d) => d.tasks) || []),
      ...(trnWeek?.days.flatMap((d) => d.tasks) || []),
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
        days: accWeek.days.map((d) => ({
          dayOfWeek: d.dayOfWeek,
          tasks: d.tasks.map((t) => ({
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
        days: trnWeek.days.map((d) => ({
          dayOfWeek: d.dayOfWeek,
          tasks: d.tasks.map((t) => ({
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
        challenge={currentChallenge ? {
          id: currentChallenge.id,
          title: currentChallenge.title,
          description: currentChallenge.description,
        } : null}
        mode={anyPublished ? "ready" : "pending"}
        weekStartIso={thisMonday.toISOString()}
        title={headerTitle}
        days={flatDays}
        daysToExpire={daysToExpire}
        // Pacientes migrados (giftsAlreadySent=true) ya tienen su camiseta
        // de antes y no deben ver el selector.
        needsShirtSize={patient.programType === "ADVANCE" && !patient.shirtSize && !patient.giftsAlreadySent}
        shippingComplete={!!(patient.shippingStreet && patient.shippingNumber && patient.shippingCity && patient.shippingPostalCode)}
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

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

  return (
    <PatientHomeDark
      assignmentIndexEntries={assignmentIndexEntries}
      welcomeLine1={welcomeLine1}
      welcomeLine2={welcomeLine2}
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
    />
  );
}
