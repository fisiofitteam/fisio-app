/**
 * GET /api/rolling-two-weeks?accessoriesId=X&trainingId=Y
 *
 * Devuelve las próximas 2 semanas (actual + siguiente) de cada programa
 * rolling indicado, con sus días L-V y las tareas de cada día.
 * Se usa desde:
 *   - PatientRollingOverridesPanel (ficha del paciente): fisio ve qué hay
 *     programado y edita/oculta por atleta.
 *   - Vista de lectura para fisios en /fisio/rolling.
 *
 * Solo pros (ceo/head_success/fisio).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { weekStartDate } from "@/lib/program-pauses";

export const runtime = "nodejs";

function canRead(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

async function loadProgramWeeks(programId: string) {
  const today = new Date();
  const thisMonday = weekStartDate(today);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(nextMonday.getDate() + 7);

  const program = await prisma.rollingProgram.findUnique({
    where: { id: programId },
    select: { id: true, name: true },
  });
  if (!program) return null;

  const weeks = await prisma.rollingWeek.findMany({
    where: {
      programId,
      weekStartDate: { in: [thisMonday, nextMonday] },
    },
    orderBy: { weekStartDate: "asc" },
    include: {
      days: {
        orderBy: { dayOfWeek: "asc" },
        include: {
          tasks: {
            orderBy: { order: "asc" },
            select: { id: true, type: true, title: true, bodyText: true, videoId: true, order: true },
          },
        },
      },
    },
  });

  return {
    programId: program.id,
    programName: program.name,
    weeks: weeks.map((w) => ({
      id: w.id,
      weekStartDate: w.weekStartDate.toISOString(),
      title: w.title,
      publishedAt: w.publishedAt?.toISOString() ?? null,
      days: w.days.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        tasks: d.tasks,
      })),
    })),
  };
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canRead(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const accessoriesId = req.nextUrl.searchParams.get("accessoriesId");
  const trainingId = req.nextUrl.searchParams.get("trainingId");

  const [accessories, training] = await Promise.all([
    accessoriesId ? loadProgramWeeks(accessoriesId) : Promise.resolve(null),
    trainingId ? loadProgramWeeks(trainingId) : Promise.resolve(null),
  ]);

  return NextResponse.json({ ok: true, accessories, training });
}
