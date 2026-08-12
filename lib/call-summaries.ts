/**
 * Generación del resumen ejecutivo de una videollamada de venta.
 *
 * Flujo:
 *   1. Cargar Lead con meetingUrl.
 *   2. Bajar la transcripción con lib/googleMeet.ts (Meet REST API).
 *   3. Pasar el texto a Claude Sonnet 4.6 con un prompt que devuelve
 *      un JSON estructurado (summary, keyPoints, outcome).
 *   4. Guardar/actualizar el CallSummary del Lead.
 *
 * Idempotente: al llamar de nuevo actualiza el registro existente. Los
 * casos donde Meet aún no expone transcript se marcan con
 * `noTranscript = true` para no reintentar en cada tick del cron.
 */
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { fetchTranscriptForMeetingUrl, MeetApiError } from "@/lib/googleMeet";

const MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 1500;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada.");
  _client = new Anthropic({ apiKey });
  return _client;
}

const PROMPT_SYSTEM = `Eres el asistente comercial de FisioFit Team. Analizas
transcripciones de videollamadas de venta entre un closer y un lead
interesado en programas de fisioterapia deportiva (RECUPERA / CONSOLIDA /
ADVANCE / PREVENTION). Tu objetivo es dejar un resumen ejecutivo útil para
que el equipo pueda hacer follow-up con contexto.

Devuelves SIEMPRE JSON válido con esta forma exacta (sin markdown, sin
comillas de código, solo el objeto):
{
  "summary": "resumen ejecutivo en 4-8 frases",
  "keyPoints": {
    "motivations": ["motivación 1", "motivación 2"],
    "objections": ["objeción 1", "objeción 2"],
    "context": ["contexto clínico o vital relevante"],
    "nextSteps": ["próximo paso acordado 1", "próximo paso 2"]
  },
  "outcome": "won" | "lost" | "rescheduled" | "unclear"
}

Reglas:
- "won"          → cerró venta / va a pagar / dijo que sí claramente.
- "lost"         → no interesado, precio, sin decisión, se pierde el lead.
- "rescheduled"  → hay que volver a llamar / pidió tiempo para pensarlo.
- "unclear"      → transcripción corta o ambigua.
- Habla en español neutro. No inventes cifras ni objeciones que no salgan
  en la transcripción. Si algo no está claro, no lo pongas.
- Cada bullet, breve y accionable.
`;

function buildUserPrompt(input: { patientName: string; transcript: string }): string {
  return `Transcripción de la videollamada de venta con ${input.patientName}:

<<<TRANSCRIPCION>>>
${input.transcript}
<<<FIN>>>

Genera el JSON con el resumen. Solo el objeto JSON, nada más.`;
}

type ParsedSummary = {
  summary: string;
  keyPoints: any;
  outcome: string;
};

function parseSummary(text: string): ParsedSummary {
  // Claude puede devolver el JSON pelado o dentro de un bloque de código;
  // buscamos el primer '{' y el último '}' para extraerlo.
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last < 0) throw new Error("Claude no devolvió JSON.");
  const json = text.slice(first, last + 1);
  const obj = JSON.parse(json);
  return {
    summary: String(obj.summary ?? "").trim(),
    keyPoints: obj.keyPoints ?? null,
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
 * Genera (o regenera) el resumen para un Lead concreto. Idempotente:
 * si ya existe CallSummary NO reintentamos salvo que se pase `force`.
 */
export async function generateSummaryForLead(
  leadId: string,
  opts: { force?: boolean } = {},
): Promise<GenerateResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, fullName: true, meetingUrl: true },
  });
  if (!lead) return { ok: false, reason: "error", detail: "Lead no encontrado" };
  if (!lead.meetingUrl) return { ok: false, reason: "no_meeting_url" };

  const existing = await prisma.callSummary.findUnique({ where: { leadId } });
  if (existing && !opts.force) {
    if (existing.summary || existing.noTranscript) {
      return { ok: true, reason: "already_processed", callSummaryId: existing.id };
    }
  }

  const t0 = Date.now();
  let transcript;
  try {
    transcript = await fetchTranscriptForMeetingUrl(lead.meetingUrl);
  } catch (e: any) {
    const msg = e instanceof MeetApiError ? e.message : e?.message ?? "unknown";
    const saved = await prisma.callSummary.upsert({
      where: { leadId },
      create: { leadId, errorMessage: msg, noTranscript: false },
      update: { errorMessage: msg },
    });
    return { ok: false, reason: "error", detail: msg, callSummaryId: saved.id };
  }
  if (!transcript || !transcript.transcriptText) {
    const saved = await prisma.callSummary.upsert({
      where: { leadId },
      create: { leadId, noTranscript: true },
      update: { noTranscript: true, errorMessage: null },
    });
    return { ok: false, reason: "no_transcript", callSummaryId: saved.id };
  }

  // Sonnet 4.6
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: PROMPT_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildUserPrompt({ patientName: lead.fullName, transcript: transcript.transcriptText }),
      },
    ],
  });
  const raw = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();

  let parsed: ParsedSummary;
  try {
    parsed = parseSummary(raw);
  } catch (e: any) {
    const saved = await prisma.callSummary.upsert({
      where: { leadId },
      create: {
        leadId,
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

  const ms = Date.now() - t0;
  const saved = await prisma.callSummary.upsert({
    where: { leadId },
    create: {
      leadId,
      transcriptText: transcript.transcriptText,
      transcriptCharCount: transcript.charCount,
      summary: parsed.summary,
      keyPoints: parsed.keyPoints ? JSON.stringify(parsed.keyPoints) : null,
      outcome: parsed.outcome,
      noTranscript: false,
      errorMessage: null,
      generationMs: ms,
    },
    update: {
      transcriptText: transcript.transcriptText,
      transcriptCharCount: transcript.charCount,
      summary: parsed.summary,
      keyPoints: parsed.keyPoints ? JSON.stringify(parsed.keyPoints) : null,
      outcome: parsed.outcome,
      noTranscript: false,
      errorMessage: null,
      generationMs: ms,
    },
  });
  return { ok: true, callSummaryId: saved.id };
}
