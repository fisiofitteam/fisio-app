import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { weekStartDate } from "@/lib/program-pauses";
import { PatientNav } from "@/components/PatientNav";
import { RollingWeekView } from "@/components/RollingWeekView";

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
}: {
  params: { id: string };
}) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: { rollingCustom: { select: { name: true } } } as any,
  });
  if (!patient) notFound();
  const patientAny = patient as any;

  const isPrevention = patient.programType === "PREVENTION";
  // Prevention es single-rolling y usa el campo legacy rollingProgramId.
  // Advance usa acc + trn + custom (con fallback al legacy).
  const accId = isPrevention ? null : patient.rollingAccessoriesId;
  const trnId = isPrevention
    ? patient.rollingProgramId
    : (patient.rollingTrainingId || patient.rollingProgramId);
  const cusId = isPrevention ? null : (patientAny.rollingCustomId ?? null);
  const cusLabel = patientAny.rollingCustom?.name ?? "Personalizado";
  const hasAnyRolling = Boolean(accId || trnId || cusId);

  // Si el paciente no está en rolling, no tiene sentido esta vista → home.
  if (patient.programMode !== "rolling" || !hasAnyRolling) {
    redirect(`/paciente/${patient.id}`);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonday = weekStartDate(today);

  const fetchWeek = async (programId: string | null) => {
    if (!programId) return null;
    return prisma.rollingWeek.findUnique({
      where: { programId_weekStartDate: { programId, weekStartDate: thisMonday } },
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
    });
  };
  const [accWeek, trnWeek, cusWeek] = await Promise.all([fetchWeek(accId), fetchWeek(trnId), fetchWeek(cusId)]);

  // Vídeos referenciados en las tareas
  const allTasksFlat = [
    ...(accWeek?.days.flatMap((d) => d.tasks) || []),
    ...(trnWeek?.days.flatMap((d) => d.tasks) || []),
    ...(cusWeek?.days.flatMap((d) => d.tasks) || []),
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
        days: trnWeek.days.map((d) => ({ dayOfWeek: d.dayOfWeek, tasks: d.tasks.map(mapTask) })),
      });
    }
  } else {
    if (accId && accWeek) {
      blocks.push({
        blockLabel: "Accesorios",
        blockColor: "#3B82F6",
        title: accWeek.title || null,
        published: Boolean(accWeek.publishedAt),
        days: accWeek.days.map((d) => ({ dayOfWeek: d.dayOfWeek, tasks: d.tasks.map(mapTask) })),
      });
    }
    if (trnId && trnWeek) {
      blocks.push({
        blockLabel: "Entrenamiento",
        blockColor: "#F59E0B",
        title: trnWeek.title || null,
        published: Boolean(trnWeek.publishedAt),
        days: trnWeek.days.map((d) => ({ dayOfWeek: d.dayOfWeek, tasks: d.tasks.map(mapTask) })),
      });
    }
    if (cusId && cusWeek) {
      blocks.push({
        blockLabel: cusLabel,
        blockColor: "#8B5CF6",
        title: cusWeek.title || null,
        published: Boolean(cusWeek.publishedAt),
        days: cusWeek.days.map((d) => ({ dayOfWeek: d.dayOfWeek, tasks: d.tasks.map(mapTask) })),
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

        <RollingWeekView
          mode={anyPublished ? "ready" : "pending"}
          weekStartIso={thisMonday.toISOString()}
          title={headerTitle}
          days={flatDays}
        />
      </div>
      <PatientNav patientId={patient.id} active="semana" variant={isPrevention ? "prevention" : "advance"} />
    </main>
  );
}
