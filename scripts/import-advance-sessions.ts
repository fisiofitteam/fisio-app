/**
 * Importer: lee un HTML con el histórico de sesiones ADVANCE (formato del
 * CEO: <h2>SEMANA X</h2> <h3>Dia N</h3> <h4>Título</h4> <p><em>desc</em></p>
 * <ul><li><strong>BLOQUE</strong><br>cuerpo</li><li>ejercicio1</li>...</ul>)
 * y hace upsert en la tabla AiSessionExample.
 *
 * Uso:
 *   tsx scripts/import-advance-sessions.ts <ruta-al-html>
 *   (por defecto: /Users/ales/Downloads/FISIOFIT_ADVANCE_Programa_Completo.html)
 *
 * Es idempotente: cada sesión se identifica por (source, dayNumber) y se
 * upsertea. Volver a correrlo con el mismo HTML no duplica.
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_HTML = "/Users/ales/Downloads/FISIOFIT_ADVANCE_Programa_Completo.html";

function stripTags(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

type Block = { heading: string; body: string; exercises: string[] };
type ParsedSession = {
  week: number;
  dayNumber: number;
  title: string;
  description: string;
  blocks: Block[];
};

function parseHtml(raw: string): ParsedSession[] {
  const weekChunks = raw.split(/<h2>SEMANA\s+(\d+)<\/h2>/i);
  const sessions: ParsedSession[] = [];
  for (let i = 1; i < weekChunks.length; i += 2) {
    const weekNum = Number(weekChunks[i]);
    const body = weekChunks[i + 1] ?? "";
    const dayChunks = body.split(/<h3>Dia\s+(\d+)<\/h3>/i);
    for (let j = 1; j < dayChunks.length; j += 2) {
      const dayNum = Number(dayChunks[j]);
      const dayBody = dayChunks[j + 1] ?? "";
      const titleMatch = dayBody.match(/<h4>([^<]+)<\/h4>/i);
      const title = titleMatch ? stripTags(titleMatch[1]) : "";
      const descMatch = dayBody.match(/<p><em>([\s\S]*?)<\/em><\/p>/i);
      const description = descMatch ? stripTags(descMatch[1]) : "";
      const ulMatch = dayBody.match(/<ul>([\s\S]*?)<\/ul>/i);
      const ulBody = ulMatch ? ulMatch[1] : "";
      const liRegex = /<li>([\s\S]*?)<\/li>/g;
      const blocks: Block[] = [];
      let currentBlock: Block | null = null;
      let m: RegExpExecArray | null;
      while ((m = liRegex.exec(ulBody)) !== null) {
        const content = m[1];
        const strongMatch = content.match(/^\s*<strong>([\s\S]*?)<\/strong>([\s\S]*)$/);
        if (strongMatch) {
          if (currentBlock) blocks.push(currentBlock);
          currentBlock = {
            heading: stripTags(strongMatch[1]),
            body: stripTags(strongMatch[2]),
            exercises: [],
          };
        } else {
          const ex = stripTags(content);
          if (ex && currentBlock) currentBlock.exercises.push(ex);
        }
      }
      if (currentBlock) blocks.push(currentBlock);
      sessions.push({ week: weekNum, dayNumber: dayNum, title, description, blocks });
    }
  }
  return sessions;
}

// Destila un "summary" muy corto a partir del título (accesorios/movilidad/
// técnica/fuerza/core) y unos "focusTags" CSV para retrieval.
function classify(title: string, blocks: Block[]): { summary: string; focusTags: string } {
  const T = title.toLowerCase();
  const bodyText = [title, ...blocks.map((b) => b.heading + " " + b.body)].join(" ").toLowerCase();
  const tags = new Set<string>();

  const push = (t: string, when: boolean) => { if (when) tags.add(t); };
  push("movilidad", /(movilidad|mov\.)/i.test(bodyText));
  push("activacion", /activaci[oó]n/i.test(bodyText));
  push("tecnica", /t[eé]cnica|técn/i.test(bodyText));
  push("fuerza", /fuerza/i.test(bodyText));
  push("core", /\bcore\b/i.test(bodyText));
  push("gymnastics", /gymnastics|dominad|pull ?up|handstand|hspu/i.test(bodyText));
  push("snatch", /snatch|ohs|overhead squat/i.test(bodyText));
  push("clean-jerk", /clean|jerk|thruster/i.test(bodyText));
  push("squat", /\bsquat\b|sentadilla/i.test(bodyText));
  push("hombro", /hombro|escapular|t[oó]rax|dorsal/i.test(bodyText));
  push("lumbar", /lumb[ao]|cadena posterior|espinal/i.test(bodyText));
  push("cadera", /cadera|hip|glteo|gl[uú]teo/i.test(bodyText));
  push("tobillo", /tobillo|ankle/i.test(bodyText));
  push("isometria", /isometr[ií]a|hold/i.test(bodyText));
  push("velocidad", /velocidad/i.test(bodyText));

  let summary = "";
  if (/^acc\b/.test(T)) summary = "accesorios";
  else if (/movilidad|mov\./i.test(T)) summary = "movilidad";
  else if (/t[eé]cnica/i.test(T)) summary = "técnica";
  else if (/\bcore\b/i.test(T)) summary = "core";
  else if (/patr[oó]n/i.test(T)) summary = "patrón";
  else if (/fuerza/i.test(T)) summary = "fuerza";
  else summary = "otro";

  return { summary, focusTags: [...tags].join(",") };
}

async function main() {
  const path = process.argv[2] ?? DEFAULT_HTML;
  console.log(`[import-advance-sessions] Leyendo ${path}`);
  const raw = readFileSync(path, "utf8");
  const sessions = parseHtml(raw);
  console.log(`[import-advance-sessions] ${sessions.length} sesiones detectadas`);

  let inserted = 0;
  let updated = 0;
  for (const s of sessions) {
    if (!s.title || s.blocks.length === 0) continue;
    const { summary, focusTags } = classify(s.title, s.blocks);
    const exerciseNames = [...new Set(s.blocks.flatMap((b) => b.exercises))].join(", ");
    // Buscamos si ya existe por (source + dayNumber). No hay unique compuesto
    // en el schema (para dejar libertad futura) — usamos findFirst + upsert.
    const existing = await prisma.aiSessionExample.findFirst({
      where: { source: "html-import", dayNumber: s.dayNumber },
      select: { id: true },
    });
    const data = {
      source: "html-import",
      weekNumber: s.week,
      dayNumber: s.dayNumber,
      title: s.title,
      summary,
      focusTags,
      description: s.description || null,
      blocksJSON: JSON.stringify(s.blocks),
      exerciseNames,
    };
    if (existing) {
      await prisma.aiSessionExample.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.aiSessionExample.create({ data });
      inserted++;
    }
  }
  console.log(`[import-advance-sessions] ✓ ${inserted} insertadas, ${updated} actualizadas`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
