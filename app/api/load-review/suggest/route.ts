import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { suggestLoadReview, DEFAULT_LOAD_REVIEW_MODEL, type LoadReviewModel } from "@/lib/load-review-ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await getActiveProfessional();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = await req.json().catch(() => ({}));
    const patientId = typeof data?.patientId === "string" ? data.patientId : "";
    const modelIn = typeof data?.model === "string" ? data.model : "";
    const model: LoadReviewModel = modelIn === "claude-opus-4-7" ? "claude-opus-4-7" : DEFAULT_LOAD_REVIEW_MODEL;
    if (!patientId) return NextResponse.json({ error: "patientId requerido" }, { status: 400 });

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true, fullName: true, diagnosis: true, bodyZone: true,
        programType: true, programStartDate: true,
        anamnesisCallNotes: true, anamnesisData: true,
        assignedProfessionalId: true,
      },
    });
    if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
    const allowed = user.isManager || patient.assignedProfessionalId === user.id;
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const brief = await prisma.loadReviewBrief.upsert({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    });

    // Catálogo: categorías que TIENEN niveles definidos.
    const categories = await prisma.movementCategory.findMany({
      include: {
        levels: { orderBy: { order: "asc" }, select: { id: true, name: true, description: true, order: true } },
      },
      orderBy: { name: "asc" },
    });
    const catalog = categories
      .filter((c) => c.levels.length > 0)
      .map((c) => ({
        categoryId: c.id,
        categoryName: c.name,
        levels: c.levels,
      }));
    if (catalog.length === 0) {
      return NextResponse.json({
        error: "No hay niveles definidos en el catálogo. Ve a Biblioteca → Niveles por categoría y crea al menos uno.",
      }, { status: 400 });
    }

    // Selecciones actuales del paciente (rellenamos null para categorías sin asignar).
    const currentSel = await prisma.patientCategoryLevel.findMany({
      where: { patientId },
      include: { category: true, categoryLevel: true },
    });
    const currentByCat = new Map(currentSel.map((s) => [s.categoryId, s]));
    const currentSelections = catalog.map((c) => {
      const cur = currentByCat.get(c.categoryId);
      return {
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        levelId: cur?.categoryLevelId ?? null,
        levelName: cur?.categoryLevel?.name ?? null,
      };
    });

    // Historia 4 semanas.
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const [sessionsRaw, metricsRaw, wodsRaw] = await Promise.all([
      prisma.programSession.findMany({
        where: { assignment: { patientId }, scheduledDate: { gte: fourWeeksAgo } },
        include: { assignment: { include: { program: true } } },
        orderBy: { scheduledDate: "asc" },
        take: 40,
      }),
      prisma.metricEntry.findMany({
        where: { metric: { patientId }, recordedAt: { gte: fourWeeksAgo } },
        include: { metric: { select: { key: true } } },
        orderBy: { recordedAt: "asc" },
        take: 80,
      }),
      prisma.wodLog.findMany({
        where: { patientId, submittedAt: { gte: fourWeeksAgo } },
        orderBy: { submittedAt: "asc" },
        take: 10,
      }),
    ]);

    let weekInProgram: number | null = null;
    if (patient.programStartDate) {
      const diffMs = Date.now() - patient.programStartDate.getTime();
      weekInProgram = Math.max(1, Math.floor(diffMs / (7 * 86400 * 1000)) + 1);
    }
    let anamnesisData: Record<string, any> | null = null;
    if (patient.anamnesisData) {
      if (typeof patient.anamnesisData === "string") {
        try { anamnesisData = JSON.parse(patient.anamnesisData); } catch {}
      } else if (typeof patient.anamnesisData === "object") {
        anamnesisData = patient.anamnesisData as any;
      }
    }

    let result;
    try {
      result = await suggestLoadReview(
        {
          patient: {
            fullName: patient.fullName,
            diagnosis: patient.diagnosis,
            bodyZone: patient.bodyZone,
            programType: patient.programType,
            weekInProgram,
          },
          brief: {
            methodology: brief.methodology,
            pdfUrl: brief.briefPdfUrl,
            pdfName: brief.briefPdfName,
          },
          anamnesisCallNotes: patient.anamnesisCallNotes,
          anamnesisData,
          currentSelections,
          catalog,
          history: {
            recentSessions: sessionsRaw.map((s) => ({
              date: s.scheduledDate.toISOString().slice(0, 10),
              completed: !!s.completedAt,
              programName: s.assignment.program.name,
            })),
            recentMetrics: metricsRaw.map((m) => ({
              date: m.recordedAt.toISOString().slice(0, 10),
              key: m.metric.key,
              value: m.value,
            })),
            recentWodLogs: wodsRaw.map((w) => ({
              date: w.submittedAt.toISOString().slice(0, 10),
              rpe: w.rpe ?? null,
              painScore: w.painScore ?? null,
              notes: w.notes ?? null,
            })),
          },
        },
        model,
      );
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? "Error generando sugerencia" }, { status: 502 });
    }

    const record = await prisma.loadReviewRecord.create({
      data: {
        patientId,
        professionalId: user.id,
        aiModel: model,
        aiSuggestion: JSON.stringify(result.output),
        aiInputTokens: result.inputTokens ?? null,
        aiOutputTokens: result.outputTokens ?? null,
      },
    });

    return NextResponse.json({
      recordId: record.id,
      model,
      output: result.output,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
  } catch (e: any) {
    console.error("[load-review/suggest] error:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Error inesperado" }, { status: 500 });
  }
}
