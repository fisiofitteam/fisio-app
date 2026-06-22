/**
 * Genera mini-guiones de stories para una semana usando Claude Opus 4.7.
 *
 * POST body:
 *   { weekId: string, dayIndex?: number, overwrite?: boolean }
 *   - dayIndex (0..6, Lun..Dom): genera solo ese día.
 *   - sin dayIndex: genera los 7 de golpe.
 *   - overwrite por defecto true (decisión del CEO).
 *
 * Devuelve:
 *   { ok: true, scripts: { [dayIndex: number]: string } }
 *
 * Persistencia: el endpoint actualiza directamente ContentWeek.weekStories.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { WEEK_STORY_STRUCTURE, dayStructureFor } from "@/lib/week-stories-structure";

const MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 4000;

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

function parseStories(raw: string | null | undefined): string[] {
  let arr: string[] = [];
  try {
    const p = JSON.parse(raw || "[]");
    if (Array.isArray(p)) arr = p.map((x) => (typeof x === "string" ? x : ""));
  } catch {}
  while (arr.length < 7) arr.push("");
  return arr.slice(0, 7);
}

function systemPrompt(): string {
  return [
    "Eres copywriter especializado en stories de Instagram para una clínica de fisioterapia online enfocada en atletas de CrossFit.",
    "Tu trabajo: redactar mini-guiones de stories accionables que el CEO pueda grabar improvisando con confianza.",
    "Estilo: tono cercano, profesional pero sin postureo médico. Sin tecnicismos vacíos. Cero promesas absolutas. Honestidad sobre lo que sirve y lo que no.",
    "",
    "FORMATO DE SALIDA por cada guion (obligatorio):",
    "Cada guion empieza con DOS líneas de cabecera:",
    "  FORMATO: <una línea muy concreta indicando si es vídeo selfie / imagen con sticker / secuencia mixta / etc, y la duración aproximada si aplica>",
    "  FRAMES: <número total de frames>",
    "Después, una línea en blanco y la secuencia de frames numerados. Cada FRAME indica:",
    " - TEXTO: lo que aparece en pantalla (corto, máx 1 frase por línea). Si el frame es solo vídeo a cámara sin overlay, escribe 'TEXTO: (sin overlay)'.",
    " - VOZ: lo que dice el CEO si está hablando a cámara. Si es solo imagen, escribe 'VOZ: —'.",
    " - VISUAL: cómo se ve el frame (plano, recurso, sticker de IG, encuesta, caja de preguntas, b-roll). Sé explícito sobre si es VÍDEO o IMAGEN.",
    "",
    "Devuelve SOLO JSON válido, sin texto adicional, sin markdown, sin ```. Estructura:",
    `{ "scripts": { "<dayIndex>": "<guion en texto plano siguiendo el formato anterior>" } } donde dayIndex es 0..6 (0=Lun, 6=Dom).`,
    "",
    "Ejemplo del aspecto de un guion (sólo orientativo):",
    "FORMATO: 🎥 Vídeo selfie a cámara, ~45s repartidos en 3 frames",
    "FRAMES: 3",
    "",
    "FRAME 1",
    "TEXTO: ¿Te han dicho que tienes que dejar el snatch?",
    "VOZ: Esto te lo han dicho mil veces y casi siempre es mentira…",
    "VISUAL: Plano cerrado del CEO en el box, mirada a cámara.",
    "",
    "FRAME 2",
    "...",
  ].join("\n");
}

function userPrompt(opts: {
  centralTheme: string;
  bodyZone: string;
  weekType: string;
  limitingBeliefs: string[];
  leadMagnetName: string | null;
  leadMagnetKeyword: string | null;
  weekNumber: number;
  year: number;
  dayIndices: number[];
}): string {
  const lines: string[] = [];
  lines.push(`Semana ${opts.weekNumber}/${opts.year} — Tema central: "${opts.centralTheme}". Zona del cuerpo: ${opts.bodyZone}. Tipo de semana: ${opts.weekType}.`);
  if (opts.limitingBeliefs.length) {
    lines.push(`Creencias limitantes a abordar: ${opts.limitingBeliefs.join(" / ")}.`);
  }
  if (opts.leadMagnetName) {
    lines.push(`Lead magnet activo: "${opts.leadMagnetName}"${opts.leadMagnetKeyword ? ` (palabra clave DM: "${opts.leadMagnetKeyword}")` : ""}.`);
  }
  lines.push("");
  lines.push("Días a redactar (sigue ESTRICTAMENTE la estructura de cada día):");
  lines.push("");
  for (const idx of opts.dayIndices) {
    const s = dayStructureFor(idx);
    lines.push(`— ${s.label} (dayIndex=${idx}) — Tipo: ${s.type}.`);
    lines.push(`  Propósito: ${s.purpose}`);
    lines.push(`  Formato sugerido: ${s.defaultFormat} (puedes ajustarlo si lo justificas, pero respeta la naturaleza vídeo/imagen)`);
    lines.push(`  Estructura: ${s.framework}`);
    lines.push("");
  }
  lines.push("Cada guion: máximo 4 frames, redactado para improvisar fácil. Sin hashtags, sin emojis abusivos.");
  lines.push(`Devuelve el JSON con SOLO los días pedidos (${opts.dayIndices.join(", ")}).`);
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const weekId = typeof body?.weekId === "string" ? body.weekId : "";
  if (!weekId) return NextResponse.json({ error: "weekId requerido" }, { status: 400 });

  const dayIndexRaw = body?.dayIndex;
  const single = typeof dayIndexRaw === "number" && dayIndexRaw >= 0 && dayIndexRaw <= 6;
  const dayIndices: number[] = single ? [dayIndexRaw] : [0, 1, 2, 3, 4, 5, 6];

  const week = await prisma.contentWeek.findUnique({ where: { id: weekId } });
  if (!week) return NextResponse.json({ error: "Semana no encontrada" }, { status: 404 });

  let limitingBeliefs: string[] = [];
  try {
    const p = JSON.parse(week.limitingBeliefs || "[]");
    if (Array.isArray(p)) limitingBeliefs = p.map(String).filter(Boolean);
  } catch {}

  const sys = systemPrompt();
  const usr = userPrompt({
    centralTheme: week.centralTheme,
    bodyZone: week.bodyZone,
    weekType: week.weekType,
    limitingBeliefs,
    leadMagnetName: week.leadMagnetName,
    leadMagnetKeyword: week.leadMagnetKeyword,
    weekNumber: week.weekNumber,
    year: week.year,
    dayIndices,
  });

  let resp;
  try {
    resp = await client().messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: sys,
      messages: [{ role: "user", content: usr }],
    });
  } catch (e: any) {
    return NextResponse.json({ error: `IA falló: ${e?.message || "error desconocido"}` }, { status: 502 });
  }

  const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: any;
  try { parsed = JSON.parse(cleaned); }
  catch (e: any) {
    return NextResponse.json({ error: `La IA no devolvió JSON válido: ${e?.message}` }, { status: 502 });
  }

  const scripts: Record<number, string> = {};
  const raw = parsed?.scripts ?? {};
  for (const idx of dayIndices) {
    const v = raw[String(idx)] ?? raw[idx];
    if (typeof v === "string" && v.trim()) scripts[idx] = v.trim();
  }

  if (Object.keys(scripts).length === 0) {
    return NextResponse.json({ error: "La IA no devolvió ningún guion utilizable." }, { status: 502 });
  }

  // Persistir en weekStories (sobrescribiendo los días pedidos)
  const current = parseStories(week.weekStories);
  for (const idxStr of Object.keys(scripts)) {
    const i = Number(idxStr);
    current[i] = scripts[i];
  }
  await prisma.contentWeek.update({
    where: { id: weekId },
    data: { weekStories: JSON.stringify(current) },
  });

  return NextResponse.json({ ok: true, scripts });
}

// Para que el front pueda mostrar la etiqueta de cada día sin hardcodear
export async function GET() {
  return NextResponse.json({
    structure: WEEK_STORY_STRUCTURE.map((d) => ({
      dow: d.dow, label: d.label, type: d.type, purpose: d.purpose,
    })),
  });
}
