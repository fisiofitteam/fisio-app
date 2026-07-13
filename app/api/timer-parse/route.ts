/**
 * POST /api/timer-parse
 *
 * Dado un texto libre (título + body de una tarea WORKOUT del rolling),
 * Claude Haiku devuelve un TimerConfig JSON con la secuencia de bloques
 * que representa lo que el atleta debe hacer.
 *
 * Body: { title: string, body?: string }
 * Devuelve: { ok: true, config: TimerConfig } | { ok: false, reason: string }
 *
 * Rápido (~1-2s) y barato con Haiku. El frontend cachea por hash de
 * contenido en localStorage — solo se llama una vez por tarea única.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCommunityActor } from "@/lib/community-actor";
import type { TimerConfig } from "@/lib/parse-timer-config";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 800;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");
  _client = new Anthropic({ apiKey });
  return _client;
}

const SYSTEM = `Eres un parser experto en formatos de entrenamiento CrossFit / Hyrox / híbrido.
Recibirás el título y descripción de una tarea de entrenamiento en español y devolverás un JSON con la secuencia de bloques del cronómetro que necesita el atleta.

Bloques soportados (kind):
  - "amrap":     { "kind": "amrap", "totalSeconds": N }
  - "emom":      { "kind": "emom", "totalSeconds": N, "intervalSeconds": M }
  - "tabata":    { "kind": "tabata", "workSeconds": W, "restSeconds": R, "rounds": K }
  - "intervals": { "kind": "intervals", "workSeconds": W, "restSeconds": R, "rounds": K }
  - "fortime":   { "kind": "fortime", "capSeconds": N|null }
  - "rest":      { "kind": "rest", "totalSeconds": N }

Reglas:
1. Si el texto describe VARIOS trabajos con descanso entre ellos, devuelve varios bloques + "rest" entre medias. Ej: "EMOM 4' cada 60s / descanso 1' / cada 45s por 3' / descanso 1' / cada 30s por 2'" →
   [emom(240,60), rest(60), emom(180,45), rest(60), emom(120,30)]
2. Si dice "AMRAP 5 x 3 rondas con 2' descanso" → 3 bloques amrap(300) + 2 bloques rest(120) intercalados.
3. Tabata por defecto: 20s work / 10s rest × 8 rondas.
4. Todos los tiempos en SEGUNDOS. Nunca en minutos.
5. Si el texto NO describe ningún cronómetro claro (ej. "sentadillas 5x5", "trabajo técnico") devuelve { "confident": false, "blocks": [] }.
6. Ignora accesorios / calentamiento / cool-down: fíjate solo en la parte cronometrada.
7. Devuelve SIEMPRE JSON válido, sin markdown, sin fences \`\`\`, sin texto extra.

Formato de respuesta:
{
  "confident": true,
  "blocks": [ ... ]
}
o
{
  "confident": false,
  "blocks": []
}`;

export async function POST(req: Request) {
  // Auth: paciente o profesional
  const actor = await getCommunityActor();
  if (!actor) return NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const bodyText = typeof body?.body === "string" ? body.body.trim() : "";
  if (!title && !bodyText) {
    return NextResponse.json({ ok: false, reason: "Texto vacío" }, { status: 400 });
  }

  const userMsg = `TÍTULO: ${title}\n\nDESCRIPCIÓN:\n${bodyText || "(sin descripción)"}`;

  try {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });

    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ ok: false, reason: "Sin JSON en respuesta" }, { status: 502 });
    }
    const parsed = JSON.parse(jsonMatch[0]) as { confident?: boolean; blocks?: any[] };

    if (!parsed?.confident || !Array.isArray(parsed?.blocks) || parsed.blocks.length === 0) {
      return NextResponse.json({ ok: false, reason: "No confía" });
    }

    // Sanitizado defensivo
    const clean = parsed.blocks
      .map((b) => sanitizeBlock(b))
      .filter((b): b is NonNullable<ReturnType<typeof sanitizeBlock>> => b !== null);
    if (clean.length === 0) {
      return NextResponse.json({ ok: false, reason: "Sin bloques válidos" });
    }

    const config: TimerConfig = { blocks: clean as any };
    return NextResponse.json({ ok: true, config });
  } catch (e: any) {
    console.error("[timer-parse] Error:", e);
    return NextResponse.json({ ok: false, reason: e?.message ?? "Error" }, { status: 500 });
  }
}

function num(v: any, min: number, max: number): number | null {
  const n = Number(v);
  if (!isFinite(n) || n < min || n > max) return null;
  return Math.round(n);
}

function sanitizeBlock(b: any): TimerConfig["blocks"][number] | null {
  if (!b || typeof b !== "object" || typeof b.kind !== "string") return null;
  switch (b.kind) {
    case "amrap": {
      const s = num(b.totalSeconds, 30, 90 * 60);
      return s ? { kind: "amrap", totalSeconds: s } : null;
    }
    case "emom": {
      const s = num(b.totalSeconds, 30, 90 * 60);
      const i = num(b.intervalSeconds, 10, 600);
      return s && i ? { kind: "emom", totalSeconds: s, intervalSeconds: i } : null;
    }
    case "tabata":
    case "intervals": {
      const w = num(b.workSeconds, 5, 900);
      const r = num(b.restSeconds, 0, 600);
      const k = num(b.rounds, 1, 30);
      return w != null && r != null && k ? { kind: b.kind, workSeconds: w, restSeconds: r, rounds: k } : null;
    }
    case "fortime": {
      if (b.capSeconds === null || b.capSeconds === undefined) return { kind: "fortime", capSeconds: null };
      const s = num(b.capSeconds, 30, 90 * 60);
      return s ? { kind: "fortime", capSeconds: s } : { kind: "fortime", capSeconds: null };
    }
    case "rest": {
      const s = num(b.totalSeconds, 5, 600);
      return s ? { kind: "rest", totalSeconds: s } : null;
    }
    default: return null;
  }
}
