/**
 * Genera una propuesta de control de cargas con IA para un paciente.
 *
 * POST body: { patientId: string, model?: "claude-sonnet-4-6" | "claude-opus-4-7" }
 *  → { recordId, output, model, inputTokens, outputTokens }
 *
 * Persiste el LoadReviewRecord con la sugerencia (sin decisión aún).
 * El paso de "aplicar/editar/ignorar" lo cierra /api/load-review/record.
 *
 * Solo CEO, head_success y fisio asignado al paciente pueden pedirlo.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { suggestLoadReview, DEFAULT_LOAD_REVIEW_MODEL, type LoadReviewModel } from "@/lib/load-review-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json().catch(() => ({}));
  const patientId = typeof data?.patientId === "string" ? data.patientId : "";
  const modelIn = typeof data?.model === "string" ? data.model : "";
  const model: LoadReviewModel = modelIn === "claude-opus-4-7" ? "claude-opus-4-7" : DEFAULT_LOAD_REVIEW_MODEL;
  if (!patientId) return NextResponse.json({ error: "patientId requerido" }, { status: 400 });

  // Acceso: managers o el fisio asignado.
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

  // Brief (singleton, sembrar vacío si no existe).
  const brief = await prisma.loadReviewBrief.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });

  // Histórico reciente (últimas 4 semanas).
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const [sessionsRaw, metricsRaw, wodsRaw] = await Promise.all([
    prisma.programSession.findMany({
      where: {
        assignment: { patientId },
        scheduledDate: { gte: fourWeeksAgo },
      },
      include: { assignment: { include: { program: true } } },
      orderBy: { scheduledDate: "asc" },
      take: 60,
    }),
    prisma.metricEntry.findMany({
      where: { metric: { patientId }, recordedAt: { gte: fourWeeksAgo } },
      include: { metric: { select: { key: true } } },
      orderBy: { recordedAt: "asc" },
      take: 200,
    }),
    prisma.wodLog.findMany({
      where: { patientId, recordedAt: { gte: fourWeeksAgo } },
      orderBy: { recordedAt: "asc" },
      take: 30,
    }),
  ]);

  // Semana en programa.
  let weekInProgram: number | null = null;
  if (patient.programStartDate) {
    const diffMs = Date.now() - patient.programStartDate.getTime();
    weekInProgram = Math.max(1, Math.floor(diffMs / (7 * 86400 * 1000)) + 1);
  }

  // anamnesisData puede venir como objeto (Postgres Json) o string (legacy).
  let anamnesisData: Record<string, any> | null = null;
  if (patient.anamnesisData) {
    if (typeof patient.anamnesisData === "string") {
      try { anamnesisData = JSON.parse(patient.anamnesisData); } catch { anamnesisData = null; }
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
          hardRules: brief.hardRules,
          goodExamples: brief.goodExamples,
          pdfUrl: brief.briefPdfUrl,
          pdfName: brief.briefPdfName,
        },
        anamnesisCallNotes: patient.anamnesisCallNotes,
        anamnesisData,
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
            date: w.recordedAt.toISOString().slice(0, 10),
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

  // Persistir registro (sin decisión aún).
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
}
