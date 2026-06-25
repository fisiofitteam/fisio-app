/**
 * Generación de propuestas de control de cargas con Anthropic.
 *
 * Solo se importa desde el server (lee process.env y llama a la API).
 *
 * - Default Sonnet 4.6 (más barato, suficiente para 90% casos).
 * - Botón opcional Opus 4.7 para casos confusos.
 * - Output JSON estructurado para pintar UI consistente.
 */
import Anthropic from "@anthropic-ai/sdk";

export type LoadReviewModel = "claude-sonnet-4-6" | "claude-opus-4-7";
export const DEFAULT_LOAD_REVIEW_MODEL: LoadReviewModel = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 3000;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY no configurada en Vercel.");
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export type LoadReviewInput = {
  patient: {
    fullName: string;
    diagnosis: string | null;
    bodyZone: string | null;
    programType: string | null;
    weekInProgram: number | null;
  };
  brief: {
    methodology: string;
    hardRules: string;
    goodExamples: string;
  };
  anamnesisCallNotes: string | null;
  anamnesisData: Record<string, any> | null;
  history: {
    recentSessions: Array<{ date: string; completed: boolean; programName: string }>;
    recentMetrics: Array<{ date: string; key: string; value: number }>;
    recentWodLogs: Array<{ date: string; rpe: number | null; painScore: number | null; notes: string | null }>;
  };
};

export type LoadReviewOutput = {
  resumenEstado: string;          // 2-3 frases sobre dónde está el paciente.
  propuesta: string;               // qué hacer concretamente esta semana.
  razonamiento: string;            // por qué (cita datos del histórico).
  flags: string[];                 // alertas (dolor alto, plateau, baja adherencia, etc.).
  alternativas: string[];          // 1-2 alternativas si el fisio no está convencido.
};

function systemPrompt(brief: LoadReviewInput["brief"]): string {
  // El fisio pega un brief completo. Lo inyectamos tal cual, sin
  // sub-secciones. Sólo añadimos rol mínimo y el formato de salida obligatorio.
  const fisioBrief = (brief.methodology || "").trim();
  return [
    "Eres un asistente clínico para un fisioterapeuta especializado en atletas de CrossFit.",
    "Tu trabajo es proponer UN borrador de control de cargas para que el fisio lo revise y apruebe.",
    "NO eres autónomo: el fisio es quien decide y firma.",
    "",
    "─── BRIEF DEL FISIO ───────────────────────────────────",
    fisioBrief || "(sin brief definido todavía — sé conservador y pide al fisio que añada uno)",
    "─── FIN DEL BRIEF ─────────────────────────────────────",
    "",
    "FORMATO DE SALIDA (obligatorio):",
    "Devuelve SOLO JSON válido, sin markdown, sin ```. Estructura exacta:",
    `{
  "resumenEstado": "2-3 frases sobre dónde está el paciente HOY",
  "propuesta": "qué cambiar concretamente esta semana (ejercicios, series, reps, %RM, frecuencia)",
  "razonamiento": "por qué, citando datos del histórico",
  "flags": ["alerta 1", "alerta 2"],
  "alternativas": ["alternativa A si quiere ser más conservador", "alternativa B si quiere empujar más"]
}`,
  ].join("\n");
}

function userPrompt(input: LoadReviewInput): string {
  const lines: string[] = [];
  lines.push(`PACIENTE: ${input.patient.fullName}`);
  if (input.patient.programType) lines.push(`Programa: ${input.patient.programType}`);
  if (input.patient.bodyZone) lines.push(`Zona afectada: ${input.patient.bodyZone}`);
  if (input.patient.diagnosis) lines.push(`Diagnóstico/motivo: ${input.patient.diagnosis}`);
  if (input.patient.weekInProgram != null) lines.push(`Semana en programa: ${input.patient.weekInProgram}`);
  lines.push("");

  if (input.anamnesisCallNotes) {
    lines.push("RESUMEN DE LA LLAMADA DE ANAMNESIS:");
    lines.push(input.anamnesisCallNotes.slice(0, 4000));
    lines.push("");
  }

  if (input.anamnesisData && Object.keys(input.anamnesisData).length > 0) {
    lines.push("FORMULARIO DE ONBOARDING (anamnesis del paciente):");
    for (const [k, v] of Object.entries(input.anamnesisData)) {
      const valStr = typeof v === "object" ? JSON.stringify(v) : String(v);
      lines.push(`  · ${k}: ${valStr.slice(0, 300)}`);
    }
    lines.push("");
  }

  // Histórico reciente
  const sessions = input.history.recentSessions.slice(-20);
  if (sessions.length > 0) {
    lines.push("SESIONES RECIENTES (más antigua → más reciente):");
    for (const s of sessions) {
      lines.push(`  · ${s.date} · ${s.programName} · ${s.completed ? "✓ completada" : "✗ NO completada"}`);
    }
    const total = sessions.length;
    const done = sessions.filter((s) => s.completed).length;
    lines.push(`(Adherencia últimas ${total}: ${done}/${total} = ${Math.round((done / total) * 100)}%)`);
    lines.push("");
  }

  const metrics = input.history.recentMetrics.slice(-40);
  if (metrics.length > 0) {
    lines.push("MÉTRICAS RECIENTES (clave → valor):");
    for (const m of metrics) {
      lines.push(`  · ${m.date} · ${m.key}=${m.value}`);
    }
    lines.push("");
  }

  const wods = input.history.recentWodLogs.slice(-10);
  if (wods.length > 0) {
    lines.push("WODS RECIENTES ADAPTADOS:");
    for (const w of wods) {
      lines.push(`  · ${w.date} · RPE=${w.rpe ?? "—"} · dolor=${w.painScore ?? "—"}${w.notes ? ` · notas: ${w.notes.slice(0, 120)}` : ""}`);
    }
    lines.push("");
  }

  lines.push("Genera ahora la propuesta de control de cargas para esta semana en el JSON especificado.");
  return lines.join("\n");
}

export async function suggestLoadReview(
  input: LoadReviewInput,
  model: LoadReviewModel = DEFAULT_LOAD_REVIEW_MODEL,
): Promise<{ output: LoadReviewOutput; inputTokens?: number; outputTokens?: number }> {
  const sys = systemPrompt(input.brief);
  const usr = userPrompt(input);

  const resp = await client().messages.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: sys,
    messages: [{ role: "user", content: usr }],
  });

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e: any) {
    throw new Error(`La IA no devolvió JSON válido: ${e?.message}`);
  }

  const output: LoadReviewOutput = {
    resumenEstado: String(parsed?.resumenEstado ?? "").trim(),
    propuesta: String(parsed?.propuesta ?? "").trim(),
    razonamiento: String(parsed?.razonamiento ?? "").trim(),
    flags: Array.isArray(parsed?.flags) ? parsed.flags.map(String) : [],
    alternativas: Array.isArray(parsed?.alternativas) ? parsed.alternativas.map(String) : [],
  };

  return {
    output,
    inputTokens: (resp as any).usage?.input_tokens,
    outputTokens: (resp as any).usage?.output_tokens,
  };
}
