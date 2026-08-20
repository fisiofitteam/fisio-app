/**
 * Generación de resúmenes IA para llamadas de seguimiento con paciente.
 *
 * A diferencia de las llamadas de venta (lib/call-summaries.ts), aquí la
 * llamada la hace el FISIO desde su Google personal, y el paciente ya está
 * activo en programa. Por eso:
 *
 *  - Descargamos la transcripción usando el token OAuth PERSONAL del fisio
 *    (getValidAccessToken({ professionalId })).
 *  - No hay sección SALES en optimización (llamada puramente clínica).
 *    En renovación sí generamos un mini-sección comercial ("renewalContext")
 *    con la propuesta discutida, objeciones, decisión — le sirve al fisio
 *    para cerrar por WhatsApp o pasar el brief al equipo.
 *  - CLINICAL: evolución del paciente (síntomas ahora, adherencia percibida,
 *    contexto vital nuevo, objetivos actualizados, banderas rojas).
 *  - COACHING (feedback al fisio): cómo condujo la llamada, qué preguntas
 *    faltaron, oportunidades de mejora.
 *
 * Se guarda en el modelo CallSummary compartido, distinguiendo Lead vs
 * PatientCall por qué FK está seteada (leadId | patientCallId).
 */
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { fetchTranscriptForMeetingUrl, MeetApiError } from "@/lib/googleMeet";

const MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 8000;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada.");
  _client = new Anthropic({ apiKey });
  return _client;
}

const PROMPT_SYSTEM = `Eres el asistente de FisioFit Team. Analizas transcripciones
de videollamadas entre un fisio y un paciente que YA está en programa activo
(RECUPERA / CONSOLIDA / ADVANCE / PREVENTION). Hay dos tipos posibles:

 - "optimization": revisión clínica y de plan. Ajustar carga, revisar síntomas
   actuales, adherencia, dolor, molestias, objetivos a corto plazo.
 - "renewal": cierre de renovación de programa. Además de lo clínico incluye
   discusión comercial: qué programa/duración se propone, precio, objeciones,
   decisión del paciente.

Devuelves SIEMPRE JSON válido con esta forma exacta (sin markdown, sin
comillas de código, solo el objeto):
{
  "clinical": {
    "summary": "resumen clínico ejecutivo en 4-8 frases centrado en cómo va el paciente AHORA",
    "currentSymptoms": ["síntoma o molestia mencionada 1", "..."],
    "adherence": ["señales sobre cumplimiento del plan (positivas o negativas)", "..."],
    "planAdjustments": ["ajuste concreto acordado en la llamada 1", "..."],
    "goalsUpdated": ["objetivo actualizado o nuevo del paciente 1", "..."],
    "redFlags": ["señal de alerta clínica si la hay"]
  },
  "renewalContext": {
    "summary": "resumen comercial de la propuesta y decisión, o cadena vacía si no aplica",
    "programProposed": "programa/duración propuesto (RECUPERA 4m, CONSOLIDA 8m, etc.) o vacío",
    "priceDiscussed": "importe o pack discutido, o cadena vacía",
    "objections": ["objeción concreta expresada por el paciente 1", "..."],
    "decision": "cerrado | pensándolo | rechazado | pendiente_seguimiento | no_aplica"
  },
  "coaching": {
    "summary": "feedback al fisio en 3-5 frases",
    "strengths": ["momento concreto en que lo hizo bien 1", "..."],
    "weaknesses": ["pregunta que faltó o error concreto 1", "..."],
    "improvements": ["propuesta accionable para próxima llamada 1", "..."]
  },
  "outcome": "clinical_ok" | "clinical_alert" | "renewed" | "renewal_pending" | "renewal_lost" | "unclear"
}

Reglas:
- "clinical_ok"          → todo dentro de lo esperado, sin alertas.
- "clinical_alert"       → hay una bandera roja o síntoma que requiere seguimiento.
- "renewed"              → paciente confirmó renovar (solo tipo renewal).
- "renewal_pending"      → paciente se lo piensa, seguimiento posterior.
- "renewal_lost"         → paciente rechazó renovar.
- "unclear"              → transcript corto o ambiguo.
- En optimización, renewalContext.summary = "" y objections = [] y decision = "no_aplica".
- Habla en español neutro. No inventes datos que no salgan en el transcript.
- Cada bullet, breve y accionable.
- Si un campo array no tiene contenido real, devuelve [] (nunca null).
- En coaching sé honesto pero constructivo.
`;

function buildUserPrompt(input: {
  patientName: string;
  callType: "optimization" | "renewal";
  fisioNote: string | null;
  transcript: string;
}): string {
  const typeLabel = input.callType === "optimization" ? "OPTIMIZACIÓN (revisión clínica)" : "RENOVACIÓN (cierre + revisión)";
  const noteBlock = input.fisioNote
    ? `\n\nNOTA PREVIA DEL FISIO (contexto que llevaba a la llamada):\n${input.fisioNote}\n`
    : "";
  return `Tipo de llamada: ${typeLabel}
Paciente: ${input.patientName}${noteBlock}

TRANSCRIPCIÓN:
${input.transcript}
`;
}

type ParsedSummary = {
  clinical: {
    summary: string;
    currentSymptoms: string[];
    adherence: string[];
    planAdjustments: string[];
    goalsUpdated: string[];
    redFlags: string[];
  };
  renewalContext: {
    summary: string;
    programProposed: string;
    priceDiscussed: string;
    objections: string[];
    decision: string;
  };
  coaching: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    improvements: string[];
  };
  outcome: string;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function parseSummary(text: string): ParsedSummary {
  // Buscamos el primer objeto JSON balanceado; Claude a veces envuelve
  // en ```json``` aunque el prompt lo prohíba.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) throw new Error("Sin JSON válido");
  const raw = text.slice(start, end + 1);
  const obj = JSON.parse(raw);
  return {
    clinical: {
      summary: String(obj.clinical?.summary ?? "").trim(),
      currentSymptoms: asStringArray(obj.clinical?.currentSymptoms),
      adherence: asStringArray(obj.clinical?.adherence),
      planAdjustments: asStringArray(obj.clinical?.planAdjustments),
      goalsUpdated: asStringArray(obj.clinical?.goalsUpdated),
      redFlags: asStringArray(obj.clinical?.redFlags),
    },
    renewalContext: {
      summary: String(obj.renewalContext?.summary ?? "").trim(),
      programProposed: String(obj.renewalContext?.programProposed ?? "").trim(),
      priceDiscussed: String(obj.renewalContext?.priceDiscussed ?? "").trim(),
      objections: asStringArray(obj.renewalContext?.objections),
      decision: String(obj.renewalContext?.decision ?? "no_aplica").trim(),
    },
    coaching: {
      summary: String(obj.coaching?.summary ?? "").trim(),
      strengths: asStringArray(obj.coaching?.strengths),
      weaknesses: asStringArray(obj.coaching?.weaknesses),
      improvements: asStringArray(obj.coaching?.improvements),
    },
    outcome: String(obj.outcome ?? "unclear").trim(),
  };
}

export type GenerateResult = {
  ok: boolean;
  reason?: "no_transcript" | "no_meeting_url" | "already_processed" | "error";
  detail?: string;
  callSummaryId?: string;
};

/**
 * Genera (o regenera con `force`) el resumen de un PatientCall. Idempotente:
 * si ya existe con clinicalSummary no reintenta.
 */
export async function generateSummaryForPatientCall(
  patientCallId: string,
  opts: { force?: boolean } = {},
): Promise<GenerateResult> {
  const call = await prisma.patientCall.findUnique({
    where: { id: patientCallId },
    select: {
      id: true,
      type: true,
      meetingUrl: true,
      fisioNote: true,
      professionalId: true,
      scheduledCallId: true,
      patient: { select: { fullName: true } },
    },
  });
  if (!call) return { ok: false, reason: "error", detail: "PatientCall no encontrado" };
  if (!call.meetingUrl) return { ok: false, reason: "no_meeting_url" };

  const existing = await prisma.callSummary.findUnique({ where: { patientCallId } });
  if (existing && !opts.force) {
    if (existing.clinicalSummary || existing.noTranscript) {
      return { ok: true, reason: "already_processed", callSummaryId: existing.id };
    }
  }

  const t0 = Date.now();
  let fetchResult;
  try {
    fetchResult = await fetchTranscriptForMeetingUrl(call.meetingUrl, {
      professionalId: call.professionalId,
    });
  } catch (e: any) {
    const msg = e instanceof MeetApiError ? e.message : e?.message ?? "unknown";
    const saved = await prisma.callSummary.upsert({
      where: { patientCallId },
      create: { patientCallId, errorMessage: msg, noTranscript: false },
      update: { errorMessage: msg },
    });
    return { ok: false, reason: "error", detail: msg, callSummaryId: saved.id };
  }

  if (fetchResult.kind !== "found") {
    const detailByKind: Record<typeof fetchResult.kind, string> = {
      no_url: "El PatientCall no tiene meetingUrl configurado.",
      no_conference: "La cuenta personal del fisio no ve esta reunión en Meet. Verifica que la llamada se hizo desde el mismo Google conectado en Integraciones.",
      no_transcript: "Meet aún no ha publicado el transcript. Suele tardar 5-30 min tras terminar la llamada.",
    };
    const detail = detailByKind[fetchResult.kind];
    const saved = await prisma.callSummary.upsert({
      where: { patientCallId },
      create: {
        patientCallId,
        noTranscript: fetchResult.kind !== "no_conference",
        errorMessage: fetchResult.kind === "no_conference" ? detail : null,
      },
      update: {
        noTranscript: fetchResult.kind !== "no_conference",
        errorMessage: fetchResult.kind === "no_conference" ? detail : null,
      },
    });
    return { ok: false, reason: "no_transcript", detail, callSummaryId: saved.id };
  }

  const transcript = fetchResult.transcript;
  if (!transcript.transcriptText) {
    const saved = await prisma.callSummary.upsert({
      where: { patientCallId },
      create: { patientCallId, noTranscript: true },
      update: { noTranscript: true, errorMessage: null },
    });
    return { ok: false, reason: "no_transcript", callSummaryId: saved.id };
  }

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: PROMPT_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildUserPrompt({
          patientName: call.patient.fullName,
          callType: call.type as "optimization" | "renewal",
          fisioNote: call.fisioNote,
          transcript: transcript.transcriptText,
        }),
      },
    ],
  });
  const raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("\n").trim();

  let parsed: ParsedSummary;
  try {
    parsed = parseSummary(raw);
  } catch (e: any) {
    const saved = await prisma.callSummary.upsert({
      where: { patientCallId },
      create: {
        patientCallId,
        transcriptText: transcript.transcriptText,
        transcriptCharCount: transcript.charCount,
        errorMessage: `Parse fail: ${e?.message ?? "unknown"}`,
      },
      update: {
        transcriptText: transcript.transcriptText,
        transcriptCharCount: transcript.charCount,
        errorMessage: `Parse fail: ${e?.message ?? "unknown"}`,
      },
    });
    return { ok: false, reason: "error", detail: `Claude devolvió inválido: ${raw.slice(0, 200)}`, callSummaryId: saved.id };
  }

  // Reutilizamos las columnas del modelo compartido:
  //  - clinicalSummary + clinicalKeyPoints (evolución del paciente)
  //  - coachingSummary + coachingKeyPoints (feedback al fisio)
  //  - salesSummary + salesKeyPoints se usan como contenedor del bloque
  //    renewalContext SOLO en llamadas de renovación (así no rompe pantallas
  //    que muestran salesSummary; para optimization queda null).
  const clinicalKeyPoints = {
    currentSymptoms: parsed.clinical.currentSymptoms,
    adherence: parsed.clinical.adherence,
    planAdjustments: parsed.clinical.planAdjustments,
    goalsUpdated: parsed.clinical.goalsUpdated,
    redFlags: parsed.clinical.redFlags,
  };
  const coachingKeyPoints = {
    strengths: parsed.coaching.strengths,
    weaknesses: parsed.coaching.weaknesses,
    improvements: parsed.coaching.improvements,
  };
  const isRenewal = call.type === "renewal";
  const salesSummary = isRenewal && parsed.renewalContext.summary
    ? parsed.renewalContext.summary
    : null;
  const salesKeyPoints = isRenewal
    ? JSON.stringify({
        programProposed: parsed.renewalContext.programProposed,
        priceDiscussed: parsed.renewalContext.priceDiscussed,
        objections: parsed.renewalContext.objections,
        decision: parsed.renewalContext.decision,
      })
    : null;

  const ms = Date.now() - t0;
  const saved = await prisma.callSummary.upsert({
    where: { patientCallId },
    create: {
      patientCallId,
      transcriptText: transcript.transcriptText,
      transcriptCharCount: transcript.charCount,
      clinicalSummary: parsed.clinical.summary,
      clinicalKeyPoints: JSON.stringify(clinicalKeyPoints),
      coachingSummary: parsed.coaching.summary || null,
      coachingKeyPoints: JSON.stringify(coachingKeyPoints),
      salesSummary,
      salesKeyPoints,
      outcome: parsed.outcome,
      noTranscript: false,
      errorMessage: null,
      generationMs: ms,
    },
    update: {
      transcriptText: transcript.transcriptText,
      transcriptCharCount: transcript.charCount,
      clinicalSummary: parsed.clinical.summary,
      clinicalKeyPoints: JSON.stringify(clinicalKeyPoints),
      coachingSummary: parsed.coaching.summary || null,
      coachingKeyPoints: JSON.stringify(coachingKeyPoints),
      salesSummary,
      salesKeyPoints,
      outcome: parsed.outcome,
      noTranscript: false,
      errorMessage: null,
      generationMs: ms,
    },
  });

  // Marca la llamada como completada cuando ya tenemos un resumen real.
  await prisma.patientCall.update({
    where: { id: call.id },
    data: { status: "completed" },
  });

  // Propagar al ScheduledCall enlazado: la llamada del panel /fisio/llamadas
  // pasa a "completed" con el outcome de la IA como resumen corto.
  if (call.scheduledCallId) {
    try {
      await prisma.scheduledCall.update({
        where: { id: call.scheduledCallId },
        data: {
          completedAt: new Date(),
          outcome: parsed.clinical.summary?.slice(0, 500) || "Llamada completada · resumen IA disponible en la ficha",
        },
      });
    } catch (e) {
      console.warn("[patient-call-summaries] no se pudo propagar completed al ScheduledCall", call.scheduledCallId, e);
    }
  }

  return { ok: true, callSummaryId: saved.id };
}
