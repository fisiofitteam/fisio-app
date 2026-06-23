/**
 * Lee la foto de la pizarra del box y devuelve el WOD transcrito en texto
 * plano listo para meter en el textarea del WodAdapter.
 *
 * POST /api/wod/from-image (multipart/form-data, campo "image": File)
 *  → { text: string }
 *
 * Usa Claude Opus 4.7 con visión multimodal (un solo paso: leer la pizarra +
 * normalizar a líneas estándar de CrossFit). Marca con [?] lo que dude para
 * que el usuario lo confirme antes de adaptar.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 1500;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type AcceptedMime = (typeof ACCEPTED)[number];

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada en Vercel.");
  _client = new Anthropic({ apiKey });
  return _client;
}

function systemPrompt(): string {
  return [
    "Eres un asistente que transcribe WODs (workouts) de CrossFit escritos a mano en la pizarra de un box.",
    "Tu único trabajo: convertir la foto en texto plano LIMPIO con el WOD en formato estándar, línea por línea.",
    "",
    "REGLAS:",
    "- Una línea por bloque/movimiento.",
    "- Si ves nombre propio del WOD entre comillas o destacado, ponlo en la primera línea entre comillas (ej: \"Fran\").",
    "- Si ves formato global (AMRAP, EMOM, For Time, X rondas, RFT, intervalos), ponlo en su propia línea inmediatamente debajo del nombre (o al principio si no hay nombre).",
    "- Cada movimiento: <reps> <movimiento> [<carga>]. Ej: '21 thrusters 42,5 kg', '15 pull-ups', '400m run', '10 burpees over bar'.",
    "- Normaliza abreviaturas comunes: KB=kettlebell, DB=dumbbell, T2B=toes to bar, C2B=chest to bar, HSPU=handstand push-up, OHS=overhead squat, BS=back squat, FS=front squat, BJ=box jump, DU=double under, SU=single under, WB=wall ball, BMU/RMU=bar/ring muscle-up.",
    "- Pesos: respeta las unidades que veas (kg o lb). Si hay separador con coma decimal (42,5), respétalo.",
    "- Si un movimiento es escalado RX/escalado, ponlo después: '21 thrusters 30 kg (escalado)'.",
    "- Si NO puedes leer una línea o dudas, escribe la mejor interpretación seguida de '[?]'. Ej: '15 power cleans 50 kg [?]'.",
    "- NO añadas explicaciones, NO uses markdown, NO uses bullets. Solo el WOD en líneas crudas.",
    "- Si la foto no parece un WOD de pizarra o está ilegible, responde EXACTAMENTE: 'NO_LEGIBLE'.",
    "",
    "Devuelve únicamente el texto plano del WOD (o NO_LEGIBLE). Nada más.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido (no es form-data)" }, { status: 400 });
  }
  const file = form.get("image");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Falta el campo 'image' o no es un fichero" }, { status: 400 });
  }
  const mime = (file.type || "").toLowerCase();
  if (!ACCEPTED.includes(mime as AcceptedMime)) {
    return NextResponse.json(
      { error: `Tipo no soportado (${mime || "desconocido"}). Usa JPG, PNG, WEBP o GIF.` },
      { status: 400 },
    );
  }
  // Limita a ~6MB para evitar disparates con la API.
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > 6 * 1024 * 1024) {
    return NextResponse.json({ error: "Imagen demasiado grande (>6 MB). Hazla más pequeña." }, { status: 413 });
  }
  const base64 = Buffer.from(bytes).toString("base64");

  let resp;
  try {
    resp = await client().messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mime as AcceptedMime, data: base64 },
            },
            { type: "text", text: "Transcribe el WOD que ves en la pizarra siguiendo las reglas." },
          ],
        },
      ],
    });
  } catch (e: any) {
    return NextResponse.json({ error: `IA falló: ${e?.message || "desconocido"}` }, { status: 502 });
  }

  const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  if (!text || text === "NO_LEGIBLE") {
    return NextResponse.json(
      { error: "No he podido leer la pizarra. Prueba con más luz, menos ángulo, o escríbelo a mano." },
      { status: 422 },
    );
  }
  return NextResponse.json({ text });
}
