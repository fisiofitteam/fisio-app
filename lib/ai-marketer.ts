/**
 * Marketer IA: consultor de marketing de contenido que responde preguntas
 * usando Claude Opus 4.7 alimentado con:
 *   1. El AiContentBrief (voz de la marca, do's/don'ts, ejemplos).
 *   2. Snapshot de métricas del panel de contenido (totales, formatos,
 *      zonas, top hooks, semanal comparativa, lead magnets).
 *
 * Devuelve texto en markdown listo para renderizar.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getAiBrief } from "@/lib/ai-brief";

const MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 4000;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");
  _client = new Anthropic({ apiKey });
  return _client;
}

// ─── Shape del contexto que le pasamos al modelo ────────────────────────────

export type MarketerContext = {
  rangeLabel: string;
  totals: {
    reach: number;
    saves: number;
    shares: number;
    comments: number;
    dmKeyword: number;
    conversions: number;
  };
  deltas: {
    reach: number | null;
    saves: number | null;
    shares: number | null;
    comments: number | null;
    dmKeyword: number | null;
    conversions: number | null;
  };
  piecesCount: number;
  formatRows: Array<{
    format: string;
    count: number;
    avgReach: number;
    avgSaves: number;
    avgComments: number;
    avgDmKeyword: number;
    avgConversions: number;
  }>;
  zoneRows: Array<{
    zone: string;
    count: number;
    avgReach: number;
    avgSaves: number;
    totalDmKeyword: number;
    totalConversions: number;
  }>;
  topHooks: Array<{
    hook: string;
    format: string;
    bodyZone: string;
    weekTheme: string | null;
    reach: number | null;
    saves: number | null;
    dmKeyword: number | null;
    conversions: number | null;
    score: number;
  }>;
  weeklyComparison: Array<{
    label: string;
    theme: string | null;
    weekType: string;
    kpiName: string | null;
    kpiTarget: number | null;
    kpiActual: number | null;
    kpiStatus: "above" | "met" | "below" | "unknown";
  }>;
  leadMagnets: Array<{
    name: string;
    keyword: string;
    active: boolean;
    lastPromotedAt: string | null;
  }>;
};

export type MarketerAskResult = {
  answer: string;
  meta: { model: string; inputTokens: number; outputTokens: number; elapsedMs: number };
};

// ─── System prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(brief: {
  brand: string; voiceTone: string; dos: string; donts: string;
  structureHints: string; goodExamples: string; badExamples: string;
}): string {
  const parts: string[] = [];
  parts.push(`Eres un consultor experto de marketing de contenido para redes sociales, especializado en Instagram Reels y en el nicho salud/fisioterapia deportiva. Trabajas con FisioFit Team, una clínica de fisioterapia online enfocada en atletas de CrossFit y Hyrox.

Tu rol:
- Analizar los datos reales que te paso del panel de contenido.
- Dar respuestas ACCIONABLES: no describas lo que ya se ve en los datos, propón qué hacer distinto.
- Grounded en la voz de la marca (más abajo).
- Cuando pidas ideas, sé concreto: "vídeo con este hook, este ángulo, este CTA".
- Cuando analices, cita datos reales del snapshot (ej. "tu formato X tiene 3x mejor guardado que Y").
- Formato de respuesta: markdown limpio con títulos ## y viñetas cuando aporte, sin abusar. Máx ~500 palabras salvo que la pregunta pida algo más largo.
- Si los datos son insuficientes, dilo abiertamente y propón qué medir mejor.
- No inventes cifras que no estén en el snapshot.`);

  if (brief.brand.trim()) parts.push(`## Marca\n${brief.brand.trim()}`);
  if (brief.voiceTone.trim()) parts.push(`## Voz y tono\n${brief.voiceTone.trim()}`);
  if (brief.structureHints.trim()) parts.push(`## Estructura habitual\n${brief.structureHints.trim()}`);
  if (brief.dos.trim()) parts.push(`## Do's\n${brief.dos.trim()}`);
  if (brief.donts.trim()) parts.push(`## Don'ts\n${brief.donts.trim()}`);
  if (brief.goodExamples.trim()) parts.push(`## Ejemplos buenos\n${brief.goodExamples.trim()}`);
  if (brief.badExamples.trim()) parts.push(`## Ejemplos malos\n${brief.badExamples.trim()}`);
  return parts.join("\n\n");
}

// ─── Serialización del contexto para el user message ─────────────────────────

function serializeContext(ctx: MarketerContext): string {
  const lines: string[] = [];
  lines.push(`# Snapshot de métricas de contenido (${ctx.rangeLabel})`);
  lines.push("");
  lines.push(`Piezas publicadas en el rango: **${ctx.piecesCount}**`);
  lines.push("");

  lines.push(`## Totales del rango vs. rango anterior`);
  const totalsList: [string, number, number | null][] = [
    ["Alcance", ctx.totals.reach, ctx.deltas.reach],
    ["Guardados", ctx.totals.saves, ctx.deltas.saves],
    ["Compartidos", ctx.totals.shares, ctx.deltas.shares],
    ["Comentarios", ctx.totals.comments, ctx.deltas.comments],
    ["DMs con palabra clave", ctx.totals.dmKeyword, ctx.deltas.dmKeyword],
    ["Conversiones (altas)", ctx.totals.conversions, ctx.deltas.conversions],
  ];
  for (const [k, v, d] of totalsList) {
    const dStr = d == null ? "sin comparativa" : `${d >= 0 ? "+" : ""}${d}% vs anterior`;
    lines.push(`- ${k}: **${v.toLocaleString("es-ES")}** (${dStr})`);
  }
  lines.push("");

  if (ctx.formatRows.length > 0) {
    lines.push(`## Rendimiento por formato`);
    for (const r of ctx.formatRows) {
      lines.push(`- **${r.format}** · ${r.count} pieza${r.count === 1 ? "" : "s"} · alc. media ${r.avgReach} · guardados medio ${r.avgSaves} · comentarios medio ${r.avgComments} · DMs medio ${r.avgDmKeyword} · conv. media ${r.avgConversions}`);
    }
    lines.push("");
  }

  if (ctx.zoneRows.length > 0) {
    lines.push(`## Rendimiento por zona corporal`);
    for (const r of ctx.zoneRows) {
      lines.push(`- **${r.zone}** · ${r.count} pieza${r.count === 1 ? "" : "s"} · alc. media ${r.avgReach} · guardados medio ${r.avgSaves} · DMs total ${r.totalDmKeyword} · conv. total ${r.totalConversions}`);
    }
    lines.push("");
  }

  if (ctx.topHooks.length > 0) {
    lines.push(`## Top 10 hooks del rango`);
    for (const h of ctx.topHooks) {
      const meta = [`${h.format}`, `zona ${h.bodyZone}`, h.weekTheme ? `tema "${h.weekTheme}"` : null].filter(Boolean).join(" · ");
      lines.push(`- "${h.hook}" (${meta}) · alc. ${h.reach ?? 0}, guard. ${h.saves ?? 0}, DMs ${h.dmKeyword ?? 0}, conv. ${h.conversions ?? 0} · score ${h.score}`);
    }
    lines.push("");
  }

  if (ctx.weeklyComparison.length > 0) {
    lines.push(`## Semanas del rango (KPI declarado por la fisio vs. real)`);
    for (const w of ctx.weeklyComparison) {
      const kpi = w.kpiName
        ? `KPI "${w.kpiName}" objetivo ${w.kpiTarget ?? "?"} · real ${w.kpiActual ?? "?"} · estado ${w.kpiStatus}`
        : "sin KPI declarado";
      lines.push(`- **${w.label}** · ${w.weekType} · tema "${w.theme ?? "-"}" · ${kpi}`);
    }
    lines.push("");
  }

  if (ctx.leadMagnets.length > 0) {
    lines.push(`## Lead magnets`);
    for (const lm of ctx.leadMagnets) {
      const last = lm.lastPromotedAt ? ` (último uso ${lm.lastPromotedAt.slice(0, 10)})` : "";
      lines.push(`- ${lm.active ? "✅" : "⏸"} **${lm.name}** — palabra clave "${lm.keyword}"${last}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Función principal ─────────────────────────────────────────────────────

export async function askMarketer(input: {
  question: string;
  context: MarketerContext;
}): Promise<MarketerAskResult> {
  const t0 = Date.now();
  const brief = await getAiBrief();
  const system = buildSystemPrompt(brief);
  const ctxBlock = serializeContext(input.context);
  const userMessage = `${ctxBlock}\n\n---\n\n**Pregunta:** ${input.question.trim()}`;

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = res.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("");

  return {
    answer: text,
    meta: {
      model: MODEL,
      inputTokens: (res.usage?.input_tokens ?? 0) as number,
      outputTokens: (res.usage?.output_tokens ?? 0) as number,
      elapsedMs: Date.now() - t0,
    },
  };
}
