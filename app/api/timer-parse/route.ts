/**
 * POST /api/timer-parse
 *
 * Dado el título + body de una tarea WORKOUT, Claude Sonnet 4.6
 * devuelve un TimerConfig JSON con la secuencia de bloques.
 *
 * El BODY es la fuente principal — los títulos suelen ser genéricos
 * (movilidad, conditioning) y no describen el timer.
 *
 * Rápido con Sonnet (~2-3s), suficiente precisión para captar patrones
 * de intervalos on/off, EMOMs multi-tramo, AMRAP encadenados, etc.
 *
 * Body: { title: string, body?: string, debug?: boolean }
 * Devuelve: { ok, config } | { ok:false, reason, raw? }
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCommunityActor } from "@/lib/community-actor";
import type { TimerConfig } from "@/lib/parse-timer-config";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1200;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");
  _client = new Anthropic({ apiKey });
  return _client;
}

const SYSTEM = `Eres un parser experto en formatos de entrenamiento CrossFit / Hyrox / híbrido / rehab.
Recibirás el título y descripción de una tarea y devuelves un JSON con la secuencia de bloques del cronómetro.

REGLA CLAVE #1: El TÍTULO suele ser genérico ("movilidad", "conditioning", "pierna"). NO CONFÍES EN EL TÍTULO PARA DETERMINAR EL FORMATO. Todo lo que importa está en la DESCRIPCIÓN. Si la descripción no describe un cronómetro claro → confident:false.

REGLA CLAVE #2: Todos los tiempos en la salida en SEGUNDOS. Nunca en minutos.

Bloques soportados (kind):
  - "amrap":     { "kind": "amrap", "totalSeconds": N }
  - "emom":      { "kind": "emom", "totalSeconds": N, "intervalSeconds": M }
  - "tabata":    { "kind": "tabata", "workSeconds": W, "restSeconds": R, "rounds": K }
  - "intervals": { "kind": "intervals", "workSeconds": W, "restSeconds": R, "rounds": K }
  - "fortime":   { "kind": "fortime", "capSeconds": N|null }
  - "rest":      { "kind": "rest", "totalSeconds": N }

INTERPRETACIÓN DE PATRONES (importante):

1. "EMOM X" o "EMOM X'" o "EMOM X min":
   → emom(totalSeconds = X*60, intervalSeconds = 60).
   Ej: "EMOM 30" → emom(1800, 60). NO es un for-time de 30s. NO es AMRAP.
   "EMOM 30" significa "Every Minute On the Minute durante 30 minutos, intervalo por defecto 60s".

2. "EMOM X' cada Ys":
   → emom(totalSeconds = X*60, intervalSeconds = Y).
   Ej: "EMOM 12' cada 90s" → emom(720, 90).

3. Intervalos ON/OFF: "W\" ON / R\" OFF durante T minutos" o "W ON / R OFF x T'"
   → intervals(workSeconds = W, restSeconds = R, rounds = floor(T*60 / (W+R))).
   Ej: "40\" ON / 20\" Off durante 12 minutos" → intervals(40, 20, 12).
   Ej: "30 on / 15 off x 10min" → intervals(30, 15, 20).

4. Intervalos por tiempo work/rest:
   "5x3'/3'" → intervals(180, 180, 5).
   "10x30s/15s" → intervals(30, 15, 10).
   "4x800m R:90s" → intervals(0, 90, 4) NO ES VÁLIDO porque no sabemos el work en tiempo (es distancia). Devuelve confident:false para estos casos si no hay tiempo de work.

5. "AMRAP X" o "AMRAP X'":
   → amrap(X*60).

6. "For time" o "Por tiempo" con opcional cap:
   → fortime(capSeconds = cap*60 si existe, null si no).

7. "Tabata" solo:
   → tabata(20, 10, 8) por defecto.
   "Tabata 30/15 x 6" → tabata(30, 15, 6).

MULTI-BLOQUE (VARIOS TRABAJOS ENCADENADOS):
Si el texto describe VARIOS trabajos separados por "descanso", "rest" o similar, devuelve la secuencia completa con bloques rest intercalados.

Ejemplos few-shot:

---
Descripción: "EMOM 4' cada 60s de pull-ups / descanso 1 min / EMOM 3' cada 45s / descanso 1 min / EMOM 2' cada 30s"
Salida:
{
  "confident": true,
  "blocks": [
    {"kind":"emom","totalSeconds":240,"intervalSeconds":60},
    {"kind":"rest","totalSeconds":60},
    {"kind":"emom","totalSeconds":180,"intervalSeconds":45},
    {"kind":"rest","totalSeconds":60},
    {"kind":"emom","totalSeconds":120,"intervalSeconds":30}
  ]
}

---
Descripción: "40\" ON / 20\" Off durante 12 minutos"
Salida:
{"confident": true, "blocks":[{"kind":"intervals","workSeconds":40,"restSeconds":20,"rounds":12}]}

---
Descripción: "EMOM 30 de: 5 burpees + 10 KBS"
Salida:
{"confident": true, "blocks":[{"kind":"emom","totalSeconds":1800,"intervalSeconds":60}]}

---
Descripción: "AMRAP 15': 12 wall-ball, 9 pull-ups, 6 burpees"
Salida:
{"confident": true, "blocks":[{"kind":"amrap","totalSeconds":900}]}

---
Descripción: "3 rondas de AMRAP 5' con 2' descanso entre rondas"
Salida:
{
  "confident": true,
  "blocks": [
    {"kind":"amrap","totalSeconds":300},
    {"kind":"rest","totalSeconds":120},
    {"kind":"amrap","totalSeconds":300},
    {"kind":"rest","totalSeconds":120},
    {"kind":"amrap","totalSeconds":300}
  ]
}

---
Descripción: "For time (cap 20'): 100 dobles, 50 wall-ball, 25 pull-ups"
Salida:
{"confident": true, "blocks":[{"kind":"fortime","capSeconds":1200}]}

---
Descripción: "Movilidad de cadera 15 min: 90-90, pigeon, hip flexor stretch"
Salida:
{"confident": false, "blocks":[]}
(no hay cronómetro estructurado — es sesión de movilidad libre)

---
Descripción: "Squat 5x5 @ 82%. Descansos 3 min."
Salida:
{"confident": false, "blocks":[]}
(fuerza pesada — no aplica cronómetro de trabajo/descanso estructurado)

---
Descripción: "Tabata: 20/10 x 8 rondas de sentadillas"
Salida:
{"confident": true, "blocks":[{"kind":"tabata","workSeconds":20,"restSeconds":10,"rounds":8}]}

REGLAS FINALES:
- Devuelve SIEMPRE JSON válido puro, sin markdown, sin fences \`\`\`, sin texto extra.
- Si no estás seguro → {"confident": false, "blocks": []}.
- Ignora accesorios/calentamiento/cool-down: fíjate solo en la parte cronometrada.`;

export async function POST(req: Request) {
  const actor = await getCommunityActor();
  if (!actor) return NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const bodyText = typeof body?.body === "string" ? body.body.trim() : "";
  const debug = body?.debug === true;
  if (!title && !bodyText) {
    return NextResponse.json({ ok: false, reason: "Texto vacío" }, { status: 400 });
  }

  const userMsg = `TÍTULO (contexto genérico, ignora para determinar formato):
${title || "(sin título)"}

DESCRIPCIÓN (fuente principal — parsea de aquí):
${bodyText || "(sin descripción)"}`;

  let rawText = "";
  try {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });

    rawText = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ ok: false, reason: "Sin JSON en respuesta", raw: debug ? rawText : undefined }, { status: 502 });
    }
    const parsed = JSON.parse(jsonMatch[0]) as { confident?: boolean; blocks?: any[] };

    if (!parsed?.confident || !Array.isArray(parsed?.blocks) || parsed.blocks.length === 0) {
      return NextResponse.json({ ok: false, reason: "No confía", raw: debug ? rawText : undefined });
    }

    const clean = parsed.blocks
      .map((b) => sanitizeBlock(b))
      .filter((b): b is NonNullable<ReturnType<typeof sanitizeBlock>> => b !== null);
    if (clean.length === 0) {
      return NextResponse.json({ ok: false, reason: "Sin bloques válidos", raw: debug ? rawText : undefined });
    }

    const config: TimerConfig = { blocks: clean as any };
    return NextResponse.json({ ok: true, config, raw: debug ? rawText : undefined });
  } catch (e: any) {
    console.error("[timer-parse] Error:", e);
    return NextResponse.json({ ok: false, reason: e?.message ?? "Error", raw: debug ? rawText : undefined }, { status: 500 });
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
      const k = num(b.rounds, 1, 60);
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
