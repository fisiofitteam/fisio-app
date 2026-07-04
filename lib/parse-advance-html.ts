// Parser + clasificador del HTML del histórico ADVANCE del CEO.
// Soporta dos formatos:
//   A) "Accesorios" — headings h2/h3/h4 + bloques en <ul><li><strong>...
//   B) "Entrenamiento" — headings h1/h2/h3 + bloques en <div class="block">
//      con <pre class="block-desc"> dentro. Nombres de bloque en un <div
//      class="block-title">.
// Autodetecta el formato al cargar. Usado por scripts/import-advance-sessions
// y el endpoint /api/ai/training-brief/import-html.

export type ParsedBlock = { heading: string; body: string; exercises: string[] };
export type ParsedSession = {
  week: number;
  dayNumber: number;
  title: string;
  description: string;
  blocks: ParsedBlock[];
};

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

/** Formato A: h2/h3/h4 + <ul><li><strong>. Sesiones de accesorios. */
function parseFormatA(raw: string): ParsedSession[] {
  const weekChunks = raw.split(/<h2>SEMANA\s+(\d+)<\/h2>/i);
  const sessions: ParsedSession[] = [];
  for (let i = 1; i < weekChunks.length; i += 2) {
    const weekNum = Number(weekChunks[i]);
    const body = weekChunks[i + 1] ?? "";
    const dayChunks = body.split(/<h3>D[ií]a\s+(\d+)<\/h3>/i);
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
      const blocks: ParsedBlock[] = [];
      let currentBlock: ParsedBlock | null = null;
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

/** Formato B: h1/h2/h3 + <div class="block"><div class="block-title">...
 *  <pre class="block-desc">...</pre></div>. Sesiones de entrenamiento. */
function parseFormatB(raw: string): ParsedSession[] {
  const weekChunks = raw.split(/<h1>\s*SEMANA\s+(\d+)\s*<\/h1>/i);
  const sessions: ParsedSession[] = [];
  for (let i = 1; i < weekChunks.length; i += 2) {
    const weekNum = Number(weekChunks[i]);
    const body = weekChunks[i + 1] ?? "";
    const dayChunks = body.split(/<h2>\s*D[ií]a\s+(\d+)\s*<\/h2>/i);
    for (let j = 1; j < dayChunks.length; j += 2) {
      const dayNum = Number(dayChunks[j]);
      const dayBody = dayChunks[j + 1] ?? "";
      const titleMatch = dayBody.match(/<h3>([\s\S]*?)<\/h3>/i);
      const title = titleMatch ? stripTags(titleMatch[1]) : "";
      const descMatch = dayBody.match(/<p[^>]*class=["']desc["'][^>]*>([\s\S]*?)<\/p>/i);
      const description = descMatch ? stripTags(descMatch[1]) : "";
      // Iteramos por <div class="block">...</div>. Como los bloques pueden
      // tener divs anidados, buscamos el <pre class="block-desc"> dentro.
      const blocks: ParsedBlock[] = [];
      const blockRegex = /<div\s+class=["']block["'][^>]*>([\s\S]*?)<\/div>\s*(?=<div\s+class=["']block|<h2|<h1|$)/gi;
      let m: RegExpExecArray | null;
      while ((m = blockRegex.exec(dayBody)) !== null) {
        const inner = m[1];
        const titleEl = inner.match(/<div\s+class=["']block-title["'][^>]*>([\s\S]*?)<\/div>/i);
        const preEl = inner.match(/<pre\s+class=["']block-desc["'][^>]*>([\s\S]*?)<\/pre>/i);
        const heading = titleEl ? stripTags(titleEl[1]).replace(/^📋\s*/, "") : "";
        const blockBody = preEl ? stripTags(preEl[1]) : stripTags(inner);
        if (!heading && !blockBody) continue;
        blocks.push({ heading, body: blockBody, exercises: [] });
      }
      // Fallback si el regex no cazó (por ejemplo, si el último <div class="block">
      // está seguido de </h1>/EOF sin otro block): buscamos también uno a uno.
      if (blocks.length === 0) {
        const anyBlockRegex = /<div\s+class=["']block["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
        let m2: RegExpExecArray | null;
        while ((m2 = anyBlockRegex.exec(dayBody)) !== null) {
          const inner = m2[1];
          const titleEl = inner.match(/<div\s+class=["']block-title["'][^>]*>([\s\S]*?)<\/div>/i);
          const preEl = inner.match(/<pre\s+class=["']block-desc["'][^>]*>([\s\S]*?)<\/pre>/i);
          blocks.push({
            heading: titleEl ? stripTags(titleEl[1]).replace(/^📋\s*/, "") : "",
            body: preEl ? stripTags(preEl[1]) : "",
            exercises: [],
          });
        }
      }
      sessions.push({ week: weekNum, dayNumber: dayNum, title, description, blocks });
    }
  }
  return sessions;
}

export function detectHtmlFormat(raw: string): "A" | "B" | "unknown" {
  // Formato B tiene un cover/style muy identificable + block-title. El A no.
  if (/class=["']block-title["']|class=["']block-desc["']/.test(raw)) return "B";
  if (/<h2>SEMANA\b/i.test(raw) && /<h3>D[ií]a\b/i.test(raw)) return "A";
  return "unknown";
}

export function parseAdvanceHtml(raw: string): ParsedSession[] {
  const fmt = detectHtmlFormat(raw);
  if (fmt === "A") return parseFormatA(raw);
  if (fmt === "B") return parseFormatB(raw);
  // Si no reconocemos, probamos los dos por si acaso.
  const a = parseFormatA(raw);
  if (a.length > 0) return a;
  return parseFormatB(raw);
}

export function classifySession(
  title: string,
  blocks: ParsedBlock[],
): { summary: string; focusTags: string } {
  const T = title.toLowerCase();
  const bodyText = [title, ...blocks.map((b) => b.heading + " " + b.body)].join(" ").toLowerCase();
  const tags = new Set<string>();
  const push = (t: string, when: boolean) => { if (when) tags.add(t); };

  push("movilidad", /(movilidad|mov\.)/i.test(bodyText));
  push("activacion", /activaci[oó]n/i.test(bodyText));
  push("tecnica", /t[eé]cnica|técn/i.test(bodyText));
  push("fuerza", /fuerza|halterofilia|weightlifting/i.test(bodyText));
  push("metcon", /metcon|amrap|for time|rft\b|conditioning/i.test(bodyText));
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
  push("barbell-cycling", /barbell cycling/i.test(bodyText));
  push("pre-season", /pre[- ]?season/i.test(bodyText));

  let summary = "";
  if (/^acc\b/.test(T)) summary = "accesorios";
  else if (/metcon|conditioning|amrap|for time/i.test(bodyText) && /fuerza|halterofilia/i.test(bodyText)) summary = "fuerza+metcon";
  else if (/metcon|conditioning/i.test(T)) summary = "metcon";
  else if (/fuerza|halterofilia/i.test(T)) summary = "fuerza";
  else if (/movilidad|mov\./i.test(T)) summary = "movilidad";
  else if (/t[eé]cnica/i.test(T)) summary = "técnica";
  else if (/\bcore\b/i.test(T)) summary = "core";
  else if (/patr[oó]n/i.test(T)) summary = "patrón";
  else summary = "otro";

  return { summary, focusTags: [...tags].join(",") };
}
