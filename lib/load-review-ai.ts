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

export type AdaptationState = "OK" | "CONDITIONAL" | "BLOCKED";

export type CurrentAdaptation = {
  movementId: string;
  movementName: string;
  category: string;
  state: AdaptationState;
  loadConstraint: string | null;
  substitutionText: string | null;
  physioWarning: string | null;
};

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
    pdfUrl?: string | null;
    pdfName?: string | null;
  };
  anamnesisCallNotes: string | null;
  anamnesisData: Record<string, any> | null;
  // Estado actual del control de cargas: lo que ya tiene marcado el fisio.
  currentAdaptations: CurrentAdaptation[];
  // Catálogo de movimientos disponibles (id+nombre+categoría) por si la IA
  // quiere mover algo de OK a CONDITIONAL/BLOCKED que aún no estaba.
  movementCatalog: Array<{ id: string; name: string; category: string }>;
  history: {
    recentSessions: Array<{ date: string; completed: boolean; programName: string }>;
    recentMetrics: Array<{ date: string; key: string; value: number }>;
    recentWodLogs: Array<{ date: string; rpe: number | null; painScore: number | null; notes: string | null }>;
  };
};

// Cambio concreto a aplicar sobre UN movimiento del paciente.
export type AdaptationChange = {
  movementId: string;
  movementName: string;
  // Estado actual del paciente (para que la UI lo muestre).
  current: {
    state: AdaptationState | null;       // null = aún no había adaptación
    loadConstraint: string | null;
    substitutionText: string | null;
    physioWarning: string | null;
  };
  // Lo que propone la IA. null = no toca ese campo.
  proposed: {
    state: AdaptationState | null;
    loadConstraint: string | null;
    substitutionText: string | null;
    physioWarning: string | null;
  };
  reason: string;                        // por qué este cambio (1-2 frases).
};

export type LoadReviewOutput = {
  resumenEstado: string;                 // 2-3 frases de contexto del paciente.
  changes: AdaptationChange[];           // cambios concretos por movimiento.
  flags: string[];                       // alertas globales (dolor alto, plateau, baja adherencia…).
  noChangeReason?: string;               // si changes está vacío: por qué (ej: "mantener semana de consolidación").
};

function systemPrompt(brief: LoadReviewInput["brief"]): string {
  const fisioBrief = (brief.methodology || "").trim();
  return [
    "Eres un asistente clínico para un fisioterapeuta especializado en atletas de CrossFit.",
    "Tu trabajo: modificar el CONTROL DE CARGAS del paciente proponiendo cambios CONCRETOS sobre ejercicios específicos.",
    "NO das consejos en texto libre. NO eres autónomo: el fisio revisa y aplica.",
    "",
    "QUÉ PUEDES CAMBIAR de cada ejercicio:",
    " - state: 'OK' (puede hacerlo tal cual) | 'CONDITIONAL' (con condiciones/sustitución parcial) | 'BLOCKED' (no puede hacerlo)",
    " - loadConstraint: carga máxima permitida en formato libre (ej: '60kg', 'Max 70% 1RM', 'Solo barra vacía')",
    " - substitutionText: ejercicio alternativo si CONDITIONAL/BLOCKED (ej: 'Z-Press en lugar de Push Press, 3x6 @ 20kg')",
    " - physioWarning: nota corta de cuidado (ej: 'Mantener escápula deprimida', 'Dolor > 4 → parar')",
    "",
    "REGLAS DE OUTPUT:",
    " 1. Sólo incluye en 'changes' los movimientos que CAMBIAN respecto a lo actual. Si un movimiento se mantiene igual, NO lo incluyas.",
    " 2. Si crees que el paciente no necesita cambios esta semana, devuelve changes=[] y rellena 'noChangeReason' con 1 frase clara.",
    " 3. Para cada cambio: pon en 'current' lo que tiene HOY (te lo doy en el input), y en 'proposed' lo que tú sugieres. Si un campo no cambia, déjalo igual en current y proposed.",
    " 4. Cada cambio debe tener 'reason' explicando por qué (1-2 frases citando datos del histórico o del PDF metodológico).",
    " 5. SI HAY DOLOR AGUDO NUEVO o flag clínica seria → propón BLOCKED + flags=[advertencia]. No empujes progresión.",
    "",
    brief.pdfUrl
      ? "El fisio ha adjuntado un PDF con su metodología completa. Es la referencia principal: léelo y aplícalo. El texto extra de abajo lo complementa pero el PDF manda."
      : "",
    "",
    "─── BRIEF DEL FISIO ───────────────────────────────────",
    fisioBrief || "(sin texto adicional; usa el PDF si lo hay)",
    "─── FIN DEL BRIEF ─────────────────────────────────────",
    "",
    "FORMATO DE SALIDA (obligatorio):",
    "Devuelve SOLO JSON válido, sin markdown, sin ```. Estructura exacta:",
    `{
  "resumenEstado": "2-3 frases de contexto (cómo está el paciente HOY).",
  "changes": [
    {
      "movementId": "<id exacto del catálogo o del estado actual>",
      "movementName": "<nombre del movimiento>",
      "current": {
        "state": "OK"|"CONDITIONAL"|"BLOCKED"|null,
        "loadConstraint": "..." | null,
        "substitutionText": "..." | null,
        "physioWarning": "..." | null
      },
      "proposed": {
        "state": "OK"|"CONDITIONAL"|"BLOCKED"|null,
        "loadConstraint": "..." | null,
        "substitutionText": "..." | null,
        "physioWarning": "..." | null
      },
      "reason": "1-2 frases de por qué"
    }
  ],
  "flags": ["alerta clínica 1", "alerta 2"],
  "noChangeReason": "solo si changes está vacío: por qué"
}`,
  ].filter(Boolean).join("\n");
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

  // Estado actual del control de cargas (lo que el fisio ya tiene marcado).
  if (input.currentAdaptations.length > 0) {
    lines.push("ESTADO ACTUAL DEL CONTROL DE CARGAS (lo que tiene HOY):");
    for (const a of input.currentAdaptations) {
      const parts = [`${a.movementName} [${a.movementId}]`, `(${a.category})`, `state=${a.state}`];
      if (a.loadConstraint) parts.push(`load="${a.loadConstraint}"`);
      if (a.substitutionText) parts.push(`subst="${a.substitutionText}"`);
      if (a.physioWarning) parts.push(`warn="${a.physioWarning}"`);
      lines.push("  · " + parts.join(" · "));
    }
    lines.push("");
  } else {
    lines.push("ESTADO ACTUAL: no hay adaptaciones aún. Todo se considera OK por defecto.");
    lines.push("");
  }

  lines.push("CATÁLOGO DE MOVIMIENTOS DISPONIBLES (usa estos ids exactos si añades nuevas restricciones):");
  for (const m of input.movementCatalog) {
    lines.push(`  · [${m.id}] ${m.name} (${m.category})`);
  }
  lines.push("");

  lines.push("Genera ahora los cambios concretos al control de cargas en el JSON especificado.");
  lines.push("Recuerda: SOLO incluye en 'changes' los movimientos que CAMBIAN. Si no cambia nada, changes=[] + noChangeReason.");
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

  // Construir el bloque de mensaje del usuario. Si hay PDF adjunto, va como
  // primer bloque "document" con cache ephemeral → Anthropic reutiliza la
  // computación del PDF entre llamadas (10% del coste tras la primera).
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

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e: any) {
    throw new Error(`La IA no devolvió JSON válido: ${e?.message}`);
  }

  function normState(v: any): AdaptationState | null {
    const s = String(v ?? "").toUpperCase();
    if (s === "OK" || s === "CONDITIONAL" || s === "BLOCKED") return s as AdaptationState;
    return null;
  }
  function normSlot(v: any): { state: AdaptationState | null; loadConstraint: string | null; substitutionText: string | null; physioWarning: string | null } {
    const o = v && typeof v === "object" ? v : {};
    return {
      state: normState(o?.state),
      loadConstraint: o?.loadConstraint ? String(o.loadConstraint) : null,
      substitutionText: o?.substitutionText ? String(o.substitutionText) : null,
      physioWarning: o?.physioWarning ? String(o.physioWarning) : null,
    };
  }
  const rawChanges = Array.isArray(parsed?.changes) ? parsed.changes : [];
  const changes: AdaptationChange[] = rawChanges
    .map((c: any) => ({
      movementId: String(c?.movementId ?? "").trim(),
      movementName: String(c?.movementName ?? "").trim(),
      current: normSlot(c?.current),
      proposed: normSlot(c?.proposed),
      reason: String(c?.reason ?? "").trim(),
    }))
    .filter((c: AdaptationChange) => c.movementId && c.movementName);

  const output: LoadReviewOutput = {
    resumenEstado: String(parsed?.resumenEstado ?? "").trim(),
    changes,
    flags: Array.isArray(parsed?.flags) ? parsed.flags.map(String) : [],
    noChangeReason: parsed?.noChangeReason ? String(parsed.noChangeReason) : undefined,
  };

  return {
    output,
    inputTokens: (resp as any).usage?.input_tokens,
    outputTokens: (resp as any).usage?.output_tokens,
  };
}
