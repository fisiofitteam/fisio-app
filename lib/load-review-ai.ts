/**
 * Sugerencia IA del control de cargas: selecciona UN NIVEL por cada CATEGORÍA
 * del catálogo. Output muy compacto (cabe en 60s plan Hobby holgadamente).
 *
 * - Sonnet 4.6 default. Opus 4.7 opcional para "segunda opinión".
 * - Soporta PDF adjunto (con prompt caching de Anthropic).
 */
import Anthropic from "@anthropic-ai/sdk";

export type LoadReviewModel = "claude-sonnet-4-6" | "claude-opus-4-7";
export const DEFAULT_LOAD_REVIEW_MODEL: LoadReviewModel = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 2500;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada en Vercel.");
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
    pdfUrl?: string | null;
    pdfName?: string | null;
  };
  anamnesisCallNotes: string | null;
  anamnesisData: Record<string, any> | null;
  // Estado actual: por cada categoría, qué nivel tiene (o null).
  currentSelections: Array<{
    categoryId: string;
    categoryName: string;
    levelId: string | null;
    levelName: string | null;
  }>;
  // Catálogo: por cada categoría, los niveles disponibles que puede elegir.
  catalog: Array<{
    categoryId: string;
    categoryName: string;
    levels: Array<{ id: string; name: string; description: string | null; order: number }>;
  }>;
  history: {
    recentSessions: Array<{ date: string; completed: boolean; programName: string }>;
    recentMetrics: Array<{ date: string; key: string; value: number }>;
    recentWodLogs: Array<{ date: string; rpe: number | null; painScore: number | null; notes: string | null }>;
  };
};

export type LevelSelection = {
  categoryId: string;
  categoryName: string;
  currentLevelId: string | null;
  currentLevelName: string | null;
  proposedLevelId: string;
  proposedLevelName: string;
  reason: string;
};

export type LoadReviewOutput = {
  resumenEstado: string;
  selections: LevelSelection[];
  flags: string[];
};

function systemPrompt(brief: LoadReviewInput["brief"]): string {
  const fisioBrief = (brief.methodology || "").trim();
  return [
    "Eres un asistente clínico para un fisioterapeuta especializado en atletas de CrossFit.",
    "Tu única tarea: elegir UN NIVEL por cada CATEGORÍA del catálogo, basándote en el perfil clínico del paciente.",
    "NO inventes niveles. SOLO elige entre los niveles disponibles que te paso para cada categoría.",
    "NO eres autónomo: el fisio revisa el plan y aprueba.",
    "",
    brief.pdfUrl
      ? "Hay un PDF adjunto con la metodología completa del fisio. Es la referencia principal; léelo y aplícalo."
      : "",
    "",
    "─── BRIEF DEL FISIO ───",
    fisioBrief || "(sin texto adicional)",
    "─── FIN ───",
    "",
    "REGLAS:",
    " 1. Para cada categoría del catálogo, propón UN nivel (de los disponibles para esa categoría).",
    " 2. Si crees que el nivel actual ya es correcto, vuelve a proponerlo (no es problema; el fisio lo verá igual).",
    " 3. Si hay dolor agudo / flag clínica seria → propón el nivel MÁS conservador disponible y márcalo en flags.",
    " 4. 'reason' de cada selección debe ser CORTO (≤120 chars).",
    " 5. 'resumenEstado' debe ser CORTO (≤300 chars).",
    "",
    "FORMATO DE SALIDA (obligatorio):",
    "Devuelve SOLO JSON válido, sin markdown, sin ```. Estructura exacta:",
    `{
  "resumenEstado": "2 frases sobre dónde está el paciente HOY",
  "selections": [
    { "categoryId": "<id exacto>", "categoryName": "<nombre>", "proposedLevelId": "<id exacto>", "proposedLevelName": "<nombre>", "reason": "1 frase" }
  ],
  "flags": ["alerta 1"]
}`,
    "",
    "REGLAS DE FORMATO JSON:",
    " · Escapa comillas dobles dentro de strings con \\\".",
    " · Sin trailing commas.",
    " · Solo comillas dobles.",
  ].filter(Boolean).join("\n");
}

function userPrompt(input: LoadReviewInput): string {
  const lines: string[] = [];
  lines.push(`PACIENTE: ${input.patient.fullName}`);
  if (input.patient.programType) lines.push(`Programa: ${input.patient.programType}`);
  if (input.patient.bodyZone) lines.push(`Zona afectada: ${input.patient.bodyZone}`);
  if (input.patient.diagnosis) lines.push(`Diagnóstico: ${input.patient.diagnosis}`);
  if (input.patient.weekInProgram != null) lines.push(`Semana en programa: ${input.patient.weekInProgram}`);
  lines.push("");

  if (input.anamnesisCallNotes) {
    lines.push("RESUMEN LLAMADA DE ANAMNESIS:");
    lines.push(input.anamnesisCallNotes.slice(0, 3500));
    lines.push("");
  }
  if (input.anamnesisData && Object.keys(input.anamnesisData).length > 0) {
    lines.push("FORMULARIO ONBOARDING:");
    for (const [k, v] of Object.entries(input.anamnesisData)) {
      const valStr = typeof v === "object" ? JSON.stringify(v) : String(v);
      lines.push(`  · ${k}: ${valStr.slice(0, 200)}`);
    }
    lines.push("");
  }

  // Historia compacta
  const s = input.history.recentSessions.slice(-10);
  if (s.length > 0) {
    const done = s.filter((x) => x.completed).length;
    lines.push(`SESIONES ÚLT (${s.length}): adherencia ${done}/${s.length}.`);
  }
  const m = input.history.recentMetrics.slice(-20);
  if (m.length > 0) {
    lines.push("MÉTRICAS RECIENTES:");
    for (const x of m) lines.push(`  · ${x.date} ${x.key}=${x.value}`);
  }
  const w = input.history.recentWodLogs.slice(-5);
  if (w.length > 0) {
    lines.push("WODs:");
    for (const x of w) lines.push(`  · ${x.date} RPE=${x.rpe ?? "-"} dolor=${x.painScore ?? "-"}`);
  }
  lines.push("");

  // Estado actual
  lines.push("ESTADO ACTUAL POR CATEGORÍA:");
  for (const c of input.currentSelections) {
    lines.push(`  · ${c.categoryName} [${c.categoryId}] → ${c.levelName ?? "(sin asignar)"}`);
  }
  lines.push("");

  // Catálogo
  lines.push("CATÁLOGO DE NIVELES DISPONIBLES (usa los IDs exactos en tu respuesta):");
  for (const cat of input.catalog) {
    lines.push(`Categoría "${cat.categoryName}" [${cat.categoryId}]:`);
    for (const lv of cat.levels) {
      lines.push(`  · [${lv.id}] ${lv.name}${lv.description ? ` — ${lv.description.slice(0, 80)}` : ""}`);
    }
  }
  lines.push("");
  lines.push("Devuelve el JSON con UN nivel propuesto por cada categoría del catálogo.");
  return lines.join("\n");
}

async function fetchPdfAsBase64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  }
}

export async function suggestLoadReview(
  input: LoadReviewInput,
  model: LoadReviewModel = DEFAULT_LOAD_REVIEW_MODEL,
): Promise<{ output: LoadReviewOutput; inputTokens?: number; outputTokens?: number }> {
  const sys = systemPrompt(input.brief);
  const usr = userPrompt(input);

  const userBlocks: any[] = [];
  if (input.brief.pdfUrl) {
    const b64 = await fetchPdfAsBase64(input.brief.pdfUrl);
    if (b64) {
      userBlocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: b64 },
        title: input.brief.pdfName ?? "Brief metodológico (PDF)",
        cache_control: { type: "ephemeral" },
      });
    }
  }
  userBlocks.push({ type: "text", text: usr });

  const resp = await client().messages.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: sys,
    messages: [{ role: "user", content: userBlocks }],
  });

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  const parsed = tryParseJsonLoose(cleaned);
  if (!parsed) {
    throw new Error(`La IA devolvió JSON no parseable. Inicio: "${cleaned.slice(0, 200)}…"`);
  }

  // Construir el output cruzando con currentSelections para rellenar currentLevelId/Name.
  const currentByCat = new Map(input.currentSelections.map((c) => [c.categoryId, c]));
  const rawSelections = Array.isArray(parsed?.selections) ? parsed.selections : [];
  const selections: LevelSelection[] = rawSelections
    .map((s: any) => {
      const categoryId = String(s?.categoryId ?? "").trim();
      const current = currentByCat.get(categoryId);
      return {
        categoryId,
        categoryName: String(s?.categoryName ?? current?.categoryName ?? "").trim(),
        currentLevelId: current?.levelId ?? null,
        currentLevelName: current?.levelName ?? null,
        proposedLevelId: String(s?.proposedLevelId ?? "").trim(),
        proposedLevelName: String(s?.proposedLevelName ?? "").trim(),
        reason: String(s?.reason ?? "").trim(),
      };
    })
    .filter((s: LevelSelection) => s.categoryId && s.proposedLevelId);

  const output: LoadReviewOutput = {
    resumenEstado: String(parsed?.resumenEstado ?? "").trim(),
    selections,
    flags: Array.isArray(parsed?.flags) ? parsed.flags.map(String) : [],
  };

  return {
    output,
    inputTokens: (resp as any).usage?.input_tokens,
    outputTokens: (resp as any).usage?.output_tokens,
  };
}

function tryParseJsonLoose(input: string): any | null {
  try { return JSON.parse(input); } catch {}
  let s = input.replace(/,\s*([}\]])/g, "$1");
  try { return JSON.parse(s); } catch {}
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const chunk = s.slice(first, last + 1).replace(/,\s*([}\]])/g, "$1");
    try { return JSON.parse(chunk); } catch {}
  }
  return null;
}
