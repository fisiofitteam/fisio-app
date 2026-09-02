import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ensurePreCallForm,
  extractScores,
  parsePreCallQuestions,
  type PreCallQuestion,
} from "@/lib/pre-call-form";

/**
 * Endpoints PÚBLICOS (protegidos por bookingToken) para el formulario previo
 * a la llamada.
 *
 *   GET  → devuelve las preguntas + estado (completed / pending).
 *   POST → guarda las respuestas y marca formCompletedAt en la PatientCall.
 *
 * Sin token válido no hay acceso. El formulario está enlazado a una
 * PatientCall concreta, no al paciente en abstracto.
 */

async function loadCallByToken(token: string) {
  return prisma.patientCall.findUnique({
    where: { bookingToken: token },
    select: {
      id: true,
      patientId: true,
      professionalId: true,
      status: true,
      tokenExpiresAt: true,
      requiresForm: true,
      formCompletedAt: true,
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const call = await loadCallByToken(params.token);
  if (!call) return NextResponse.json({ error: "Token inválido" }, { status: 404 });
  if (call.tokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Link caducado" }, { status: 410 });
  }
  if (!call.requiresForm) {
    return NextResponse.json({ error: "Esta llamada no requiere formulario" }, { status: 404 });
  }

  const form = await ensurePreCallForm();
  const questions = parsePreCallQuestions(form.questions);

  return NextResponse.json({
    form: {
      id: form.id,
      name: form.name,
      description: form.description,
      questions,
    },
    completed: !!call.formCompletedAt,
    completedAt: call.formCompletedAt?.toISOString() ?? null,
  });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const call = await loadCallByToken(params.token);
  if (!call) return NextResponse.json({ error: "Token inválido" }, { status: 404 });
  if (call.tokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Link caducado" }, { status: 410 });
  }
  if (!call.requiresForm) {
    return NextResponse.json({ error: "Esta llamada no requiere formulario" }, { status: 400 });
  }
  if (call.formCompletedAt) {
    return NextResponse.json({ error: "El formulario ya fue rellenado" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const rawAnswers = body?.answers;
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
    return NextResponse.json({ error: "answers requerido (objeto)" }, { status: 400 });
  }
  const answers = rawAnswers as Record<string, unknown>;

  const form = await ensurePreCallForm();
  const questions: PreCallQuestion[] = parsePreCallQuestions(form.questions);
  const { satisfactionScore, npsScore } = extractScores(questions, answers);

  const snapshot = {
    name: form.name,
    description: form.description ?? null,
    questions,
  };

  // El endpoint puede recibir el POST más de una vez si el navegador reintenta
  // (mala red, cierre de pestaña). El unique en patientCallId nos protege.
  await prisma.$transaction([
    prisma.patientCallFormResponse.create({
      data: {
        patientCallId: call.id,
        patientId: call.patientId,
        professionalId: call.professionalId,
        formSnapshot: JSON.stringify(snapshot),
        answers: JSON.stringify(answers),
        satisfactionScore,
        npsScore,
      },
    }),
    prisma.patientCall.update({
      where: { id: call.id },
      data: { formCompletedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
