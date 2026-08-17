/**
 * Generación de resúmenes ejecutivos de una videollamada de venta.
 *
 * Sobre la misma transcripción se producen DOS versiones distintas:
 *   - Sales    → para la card verde en /fisio/llamadas-venta. Solo lo
 *                comercial (motivaciones, objeciones, próximos pasos).
 *   - Clinical → para la ficha del paciente en la pestaña Formularios,
 *                encima del textarea "Notas de la llamada de anamnesis".
 *                Contiene motivo de consulta, síntomas, historial, etc.
 *
 * Ambas van en el mismo registro CallSummary (columnas sales_* y clinical_*).
 * Idempotente: si `salesSummary` ya existe no regenera salvo `force`.
 * Los casos donde Meet aún no expone transcript se marcan con
 * `noTranscript = true` para no reintentar en cada tick del cron.
 */
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { fetchTranscriptForMeetingUrl, MeetApiError } from "@/lib/googleMeet";

const MODEL = "claude-sonnet-4-6";
// 3 secciones (sales + clinical + coaching) con transcripciones largas dejan
// las respuestas cerca de 9-10k chars → truncaba a mitad JSON. Con 8000 tokens
// tenemos margen para conversaciones densas sin cortar la última llave.
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
de videollamadas de venta entre un closer y un lead interesado en programas de
fisioterapia deportiva (RECUPERA / CONSOLIDA / ADVANCE / PREVENTION).

Debes producir TRES resúmenes distintos de la misma llamada, con enfoques
completamente separados:

- SALES (comercial): solo lo relevante para el equipo de venta / follow-up.
  Motivaciones de compra, objeciones, contexto de decisión, próximos pasos
  comerciales, cierre. NO incluyas detalles clínicos.

- CLINICAL (clínico): solo lo relevante para el fisio que va a atender al
  paciente. Motivo de consulta, síntomas, historial médico y quirúrgico,
  contexto de vida (trabajo, entrenamiento, sueño), objetivos deportivos,
  banderas rojas. NO incluyas precios, objeciones de venta ni detalles de
  pago.

- COACHING (entrenamiento del closer): SOLO si el outcome es "won" o "lost".
  Análisis del rendimiento del closer en esta llamada, para que la use como
  material de mejora. Sé concreto y accionable: menciona momentos concretos,
  frases o técnicas, no genéricos. Si el outcome es "rescheduled" o "unclear",
  deja summary="" y todos los arrays vacíos.

Devuelves SIEMPRE JSON válido con esta forma exacta (sin markdown, sin
comillas de código, solo el objeto):
{
  "sales": {
    "summary": "resumen comercial ejecutivo en 3-6 frases",
    "motivations": ["motivación de compra 1", "motivación 2"],
    "objections": ["objeción comercial 1", "objeción 2"],
    "nextSteps": ["próximo paso comercial acordado 1", "próximo paso 2"]
  },
  "clinical": {
    "summary": "resumen clínico ejecutivo en 4-8 frases",
    "mainComplaint": "motivo principal de consulta en una frase",
    "symptoms": ["síntoma 1", "síntoma 2"],
    "history": ["antecedente relevante 1", "antecedente 2"],
    "contextLifestyle": ["contexto vital relevante (trabajo, sueño, entreno)"],
    "goals": ["objetivo deportivo/funcional 1", "objetivo 2"],
    "redFlags": ["señal de alerta clínica si la hay"]
  },
  "coaching": {
    "summary": "análisis global del desempeño del closer en 3-5 frases",
    "strengths": ["momento concreto en que el closer lo hizo bien 1", "..."],
    "weaknesses": ["error/oportunidad perdida concreta 1", "..."],
    "improvements": ["propuesta accionable para próximas llamadas 1", "..."]
  },
  "outcome": "won" | "lost" | "rescheduled" | "unclear"
}

Reglas:
- "won"          → cerró venta / va a pagar / dijo que sí claramente.
- "lost"         → no interesado, precio, sin decisión, se pierde el lead.
- "rescheduled"  → hay que volver a llamar / pidió tiempo para pensarlo.
- "unclear"      → transcripción corta o ambigua.
- Habla en español neutro. No inventes datos que no salgan en la
  transcripción. Si algo no está claro, deja el array vacío.
- Cada bullet, breve y accionable.
- Si un campo array no tiene contenido real, devuelve [] (nunca null).
- En coaching sé honesto pero constructivo: incluso una llamada ganada puede
  tener áreas de mejora, y una perdida puede haber tenido buenos momentos.
`;

function buildUserPrompt(input: {
  patientName: string;
  transcript: string;
  /** Estado final decidido por el equipo (won/lost) si ya está confirmado.
   *  Cuando lo pasamos, el modelo debe generar coaching sí o sí. */
  confirmedOutcome?: "won" | "lost" | null;
}): string {
  const outcomeHint = input.confirmedOutcome
    ? `\n\nIMPORTANTE: el equipo ya ha confirmado que esta llamada terminó como "${input.confirmedOutcome}". Ese es el outcome definitivo — ignora tu propia intuición si difiere y genera coaching completo (fortalezas, debilidades, mejoras) analizando por qué acabó así.\n`
    : "";
  return `Transcripción de la videollamada de venta con ${input.patientName}:

<<<TRANSCRIPCION>>>
${input.transcript}
<<<FIN>>>${outcomeHint}

Genera el JSON con los tres resúmenes (sales + clinical + coaching) y el outcome. Solo el objeto JSON, nada más.`;
}

type SalesSection = {
  summary: string;
  motivations: string[];
  objections: string[];
  nextSteps: string[];
};
type ClinicalSection = {
  summary: string;
  mainComplaint: string;
  symptoms: string[];
  history: string[];
  contextLifestyle: string[];
  goals: string[];
  redFlags: string[];
};
type CoachingSection = {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
};
type ParsedSummary = {
  sales: SalesSection;
  clinical: ClinicalSection;
  coaching: CoachingSection;
  outcome: string;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter((s) => s.trim().length > 0);
}

function parseSummary(text: string): ParsedSummary {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last < 0) throw new Error("Claude no devolvió JSON.");
  const obj = JSON.parse(text.slice(first, last + 1));
  const s = obj.sales ?? {};
  const c = obj.clinical ?? {};
  const co = obj.coaching ?? {};
  return {
    sales: {
      summary: String(s.summary ?? "").trim(),
      motivations: asStringArray(s.motivations),
      objections: asStringArray(s.objections),
      nextSteps: asStringArray(s.nextSteps),
    },
    clinical: {
      summary: String(c.summary ?? "").trim(),
      mainComplaint: String(c.mainComplaint ?? "").trim(),
      symptoms: asStringArray(c.symptoms),
      history: asStringArray(c.history),
      contextLifestyle: asStringArray(c.contextLifestyle),
      goals: asStringArray(c.goals),
      redFlags: asStringArray(c.redFlags),
    },
    coaching: {
      summary: String(co.summary ?? "").trim(),
      strengths: asStringArray(co.strengths),
      weaknesses: asStringArray(co.weaknesses),
      improvements: asStringArray(co.improvements),
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
 * Genera (o regenera) los resúmenes para un Lead concreto. Idempotente:
 * si `salesSummary` ya existe NO reintentamos salvo `force`. Los registros
 * v1 (solo `summary` legacy) se regeneran automáticamente porque
 * `salesSummary` está vacío en ellos.
 */
export async function generateSummaryForLead(
  leadId: string,
  opts: { force?: boolean } = {},
): Promise<GenerateResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, fullName: true, meetingUrl: true, status: true },
  });
  if (!lead) return { ok: false, reason: "error", detail: "Lead no encontrado" };
  if (!lead.meetingUrl) return { ok: false, reason: "no_meeting_url" };

  // El status del LEAD manda sobre el outcome que decida el IA. Si el closer
  // ya marcó won/lost, ese es el desenlace real. El IA puede haber leído
  // "déjame pensarlo" y clasificado como rescheduled, pero si luego ghosteó
  // y el closer lo marcó lost, el bloque de coaching debe existir como PERDIDA.
  const confirmedOutcome = lead.status === "won" || lead.status === "lost"
    ? (lead.status as "won" | "lost")
    : null;

  const existing = await prisma.callSummary.findUnique({ where: { leadId } });
  if (existing && !opts.force) {
    // Consideramos "listo" solo si:
    //  - salesSummary ya existe
    //  - Y outcome del summary coincide con el status del lead (si won/lost)
    //  - Y si es won/lost, coachingSummary también existe
    // Reprocesamos automáticamente los desincronizados (ej. IA dijo
    // rescheduled pero el closer marcó lost después).
    const outcomeInSync = confirmedOutcome ? existing.outcome === confirmedOutcome : true;
    const readyForOutcome = confirmedOutcome ? !!existing.coachingSummary : true;
    if ((existing.salesSummary && outcomeInSync && readyForOutcome) || existing.noTranscript) {
      return { ok: true, reason: "already_processed", callSummaryId: existing.id };
    }
  }

  const t0 = Date.now();
  let fetchResult;
  try {
    fetchResult = await fetchTranscriptForMeetingUrl(lead.meetingUrl);
  } catch (e: any) {
    const msg = e instanceof MeetApiError ? e.message : e?.message ?? "unknown";
    const saved = await prisma.callSummary.upsert({
      where: { leadId },
      create: { leadId, errorMessage: msg, noTranscript: false },
      update: { errorMessage: msg },
    });
    return { ok: false, reason: "error", detail: msg, callSummaryId: saved.id };
  }
  if (fetchResult.kind !== "found") {
    // Diferenciamos: no_conference (la cuenta OAuth no ve la Meet — organizador
    // es otra cuenta) de no_transcript (sí la ve pero aún no publicó archivo).
    // La primera es permanente; la segunda se puede reintentar más tarde.
    const detailByKind: Record<typeof fetchResult.kind, string> = {
      no_url: "El lead no tiene meetingUrl configurado.",
      no_conference: "La cuenta de Google conectada (videoconsultas@fisiofitteam.com) NO ve esta reunión en Meet. Suele pasar cuando el organizador es otra cuenta (Ales personal, por ejemplo). Solución: la reunión debe crearse desde la cuenta de videoconsultas para que Meet exponga la transcripción por API.",
      no_transcript: "Meet aún no ha publicado el archivo del transcript. Suele tardar 5-30 min tras terminar la llamada. Reintenta más tarde.",
    };
    const detail = detailByKind[fetchResult.kind];
    const saved = await prisma.callSummary.upsert({
      where: { leadId },
      create: {
        leadId,
        noTranscript: fetchResult.kind !== "no_conference", // no_conference no se reintenta
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
      where: { leadId },
      create: { leadId, noTranscript: true },
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
          patientName: lead.fullName,
          transcript: transcript.transcriptText,
          confirmedOutcome,
        }),
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

  const salesKeyPoints = {
    motivations: parsed.sales.motivations,
    objections: parsed.sales.objections,
    nextSteps: parsed.sales.nextSteps,
  };
  const clinicalKeyPoints = {
    mainComplaint: parsed.clinical.mainComplaint,
    symptoms: parsed.clinical.symptoms,
    history: parsed.clinical.history,
    contextLifestyle: parsed.clinical.contextLifestyle,
    goals: parsed.clinical.goals,
    redFlags: parsed.clinical.redFlags,
  };
  // El outcome final es el que dice el LEAD (status del equipo). Solo si el
  // equipo aún no ha decidido (scheduled) usamos lo que dijo el IA.
  const finalOutcome = confirmedOutcome ?? parsed.outcome;
  // El coaching solo tiene sentido para outcomes concluyentes.
  const isConclusive = finalOutcome === "won" || finalOutcome === "lost";
  const coachingSummary = isConclusive ? parsed.coaching.summary || null : null;
  const coachingKeyPoints = isConclusive && parsed.coaching.summary
    ? JSON.stringify({
        strengths: parsed.coaching.strengths,
        weaknesses: parsed.coaching.weaknesses,
        improvements: parsed.coaching.improvements,
      })
    : null;

  const ms = Date.now() - t0;
  const saved = await prisma.callSummary.upsert({
    where: { leadId },
    create: {
      leadId,
      transcriptText: transcript.transcriptText,
      transcriptCharCount: transcript.charCount,
      salesSummary: parsed.sales.summary,
      salesKeyPoints: JSON.stringify(salesKeyPoints),
      clinicalSummary: parsed.clinical.summary,
      clinicalKeyPoints: JSON.stringify(clinicalKeyPoints),
      coachingSummary,
      coachingKeyPoints,
      outcome: finalOutcome,
      noTranscript: false,
      errorMessage: null,
      generationMs: ms,
    },
    update: {
      transcriptText: transcript.transcriptText,
      transcriptCharCount: transcript.charCount,
      salesSummary: parsed.sales.summary,
      salesKeyPoints: JSON.stringify(salesKeyPoints),
      clinicalSummary: parsed.clinical.summary,
      clinicalKeyPoints: JSON.stringify(clinicalKeyPoints),
      coachingSummary,
      coachingKeyPoints,
      outcome: finalOutcome,
      noTranscript: false,
      errorMessage: null,
      generationMs: ms,
    },
  });
  return { ok: true, callSummaryId: saved.id };
}
