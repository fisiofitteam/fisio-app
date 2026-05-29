import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { weekStartDate } from "@/lib/program-pauses";

// GET /api/admin/debug-patient-rolling?id=PATIENT_ID
// Devuelve el estado del rolling del paciente y de la semana actual de cada
// programa rolling asignado, para diagnosticar por qué no aparecen tareas
// en la home del paciente.
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patient = await prisma.patient.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      programType: true,
      programMode: true,
      rollingProgramId: true,
      rollingAccessoriesId: true,
      rollingTrainingId: true,
    },
  });
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonday = weekStartDate(today);

  const slotIds = [
    { slot: "accessories", id: patient.rollingAccessoriesId },
    { slot: "training", id: patient.rollingTrainingId },
    { slot: "legacy", id: patient.rollingProgramId },
  ].filter((s) => !!s.id) as { slot: string; id: string }[];

  const programs = await prisma.rollingProgram.findMany({
    where: { id: { in: slotIds.map((s) => s.id) } },
    select: { id: true, name: true, isActive: true },
  });
  const progById = new Map(programs.map((p) => [p.id, p]));

  const weeks = await Promise.all(
    slotIds.map(async (s) => {
      const week = await prisma.rollingWeek.findUnique({
        where: { programId_weekStartDate: { programId: s.id, weekStartDate: thisMonday } },
        include: {
          days: {
            include: { tasks: { select: { id: true, type: true, title: true } } },
            orderBy: { dayOfWeek: "asc" },
          },
        },
      });
      return {
        slot: s.slot,
        programId: s.id,
        programName: progById.get(s.id)?.name || null,
        programActive: progById.get(s.id)?.isActive ?? null,
        weekFound: !!week,
        weekId: week?.id ?? null,
        weekTitle: week?.title ?? null,
        publishedAt: week?.publishedAt?.toISOString() ?? null,
        weekStartDate: week?.weekStartDate?.toISOString() ?? null,
        days: week?.days.map((d) => ({
          dayOfWeek: d.dayOfWeek,
          taskCount: d.tasks.length,
          tasks: d.tasks.map((t) => ({ id: t.id, type: t.type, title: t.title })),
        })) ?? [],
      };
    }),
  );

  return NextResponse.json({
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      programType: patient.programType,
      programMode: patient.programMode,
      rollingAccessoriesId: patient.rollingAccessoriesId,
      rollingTrainingId: patient.rollingTrainingId,
      rollingProgramId: patient.rollingProgramId,
    },
    expectedThisMondayIso: thisMonday.toISOString(),
    todayIso: today.toISOString(),
    slots: weeks,
  });
}
