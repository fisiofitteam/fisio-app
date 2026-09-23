/**
 * POST /api/content/marketer/generate
 *
 * Marketer IA: recibe un brief del CEO ("lanzamiento X día, 2 semanas
 * antes, 3 reels + 1 carrusel/sem") y devuelve una propuesta de estrategia
 * con semanas y piezas. NO persiste nada — el CEO decide qué añadir con
 * el endpoint /apply.
 *
 * Body:
 *   {
 *     brief: string,               // texto libre del CEO
 *     targetDate?: string,         // YYYY-MM-DD (lanzamiento, opcional)
 *     weeksAhead?: number,         // cuántas semanas planificar (1-8, default 2)
 *     piecesPerWeek?: {            // mezcla por semana
 *       reel?: number;
 *       carousel?: number;
 *       infographic?: number;
 *       image?: number;
 *       live?: number;
 *     }
 *   }
 *
 * Respuesta:
 *   {
 *     ok: true,
 *     strategy: string,            // resumen del arco narrativo (2-4 frases)
 *     weeks: [{
 *       weekOffset: number,        // 0 = semana que viene, 1 = la siguiente...
 *       centralTheme: string,
 *       bodyZone: string,
 *       weekType: "educativa" | "objeciones" | "lanzamiento" | "recuperacion",
 *       limitingBeliefs: string[],
 *       pieces: [{
 *         dayOfWeek: number,       // 1..7
 *         format: "reel" | "carousel" | "infographic" | "image" | "live",
 *         title: string,
 *         hook: string,
 *         goals: string[],
 *         rationale: string        // 1-2 frases: por qué esta pieza aquí
 *       }]
 *     }]
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getAiBrief } from "@/lib/ai-brief";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Sonnet con tool-use grande puede tardar 30-90s cuando el brief es largo
// y pedimos 4 semanas con mezcla amplia. 300s = techo Vercel Pro.
export const maxDuration = 300;

const MODEL = "claude-sonnet-4-6";
// Con guion por planos cada reel añade ~600-900 tokens al output. 3 semanas
// con 5 piezas (3 reels + 1 carrusel + 1 directo) pueden pedir 12-16k
// tokens. Subimos el techo bien alto para no cortar el tool_use — Sonnet
// 4.6 soporta salidas de hasta 64k, así que 20k es margen cómodo.
const MAX_OUTPUT_TOKENS = 20000;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada.");
  _client = new Anthropic({ apiKey });
  return _client;
}

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

function systemPrompt(brief: Awaited<ReturnType<typeof getAiBrief>>, includeScript: boolean): string {
  return [
    "Eres el Marketer IA de FisioFit Team, una clínica de fisioterapia online para atletas de CrossFit.",
    "Tu trabajo: diseñar estrategias de contenido de Instagram accionables — semanas con tema central + piezas concretas (hook + objetivo + rationale).",
    "",
    "CONTEXTO DE LA MARCA:",
    brief.brand || "(sin brief configurado)",
    "",
    "TONO DE VOZ:",
    brief.voiceTone || "cercano, profesional, sin postureo médico, sin promesas absolutas",
    "",
    "SÍ HACER:",
    brief.dos || "",
    "",
    "NO HACER:",
    brief.donts || "",
    "",
    "ESTRUCTURA HABITUAL DE UNA SEMANA:",
    brief.structureHints || "Lunes pregunta/dolor, Martes mito, Miércoles ejercicio, Jueves caso, Viernes CTA/lead magnet",
    "",
    "OBJETIVOS DE PIEZA (elige 1-2 por pieza):",
    "  - atraer: hook de alcance frío, tema polémico o gancho fuerte",
    "  - conectar: contenido personal, historia, vulnerabilidad",
    "  - educar: mito/verdad, técnica, ejercicio, tutorial",
    "  - convertir: CTA a lead magnet o programa, testimonio, resultado",
    "  - lanzamiento: pieza de un bloque de lanzamiento (recordatorio, urgencia, apertura, cierre)",
    "",
    "TIPOS DE SEMANA:",
    "  - educativa: mezcla estándar, sin lanzamiento activo",
    "  - objeciones: rebatir creencias limitantes de la audiencia",
    "  - lanzamiento: promoción activa de un programa o servicio nuevo",
    "  - recuperacion: bajar intensidad tras lanzamiento, sanar la audiencia",
    "",
    "FORMATOS DISPONIBLES:",
    "  - reel: vídeo corto vertical (default para alcance)",
    "  - carousel: 6-10 slides de imagen o texto (default para educar/profundizar)",
    "  - infographic: pieza estática única (menos común)",
    "  - image: foto suelta (personal/behind the scenes)",
    "  - live: directo",
    "",
    "IMPORTANTE:",
    "- Responde SOLO con la herramienta `submit_strategy`, sin texto adicional.",
    "- Si el CEO adjunta un PDF (plan estratégico, resultados, competencia, brand book…), léelo entero y úsalo como contexto primario para la estrategia. Extrae temas, ángulos, público objetivo, tono, datos concretos y referencias de ese PDF, y ancla la estrategia en ellos. Cuando cites o te apoyes en el PDF, hazlo de forma implícita (no digas 'según el PDF', sino integra el dato como si fuera propio).",
    "- Si el CEO especifica una fecha de lanzamiento, alinea la semana de lanzamiento con ella.",
    "- MEZCLA: si el CEO especifica cuántas piezas de cada formato por semana, CUMPLE ESE CONTEO EXACTO. Si pide 3 reels + 1 carrusel/semana, cada semana lleva EXACTAMENTE 3 reels y EXACTAMENTE 1 carrusel — ni una menos, ni una más, ni ningún formato distinto. Prohibido reducir el número aunque parezca creativamente 'suficiente' con menos. Cuenta los formatos antes de devolver la tool.",
    "- Titles cortos y específicos.",
    "- 'hook' = IDEA PRINCIPAL de la pieza: 1-2 frases que resumen QUÉ se cuenta y CÓMO (ángulo/tono). NO es el hook literal de apertura del vídeo. Ej: 'Reel confrontacional sobre por qué el descanso no cura el hombro. Termina con CTA al webinar.'",
    "- Rationale en 1-2 frases explicando por qué esa pieza en ese slot.",
    "",
    includeScript
      ? [
          "GUION POR PLANOS (obligatorio para format=reel, opcional para el resto):",
          "",
          "Para CADA reel devuelve un array `blocks` con 3 o 4 objetos, labels 'Plano 1'…'Plano 4' en orden.",
          "El content de cada plano describe la IDEA a transmitir en ese plano — QUÉ se dice y CÓMO se muestra — nunca la frase literal.",
          "",
          "ESTRUCTURA RECOMENDADA DE UN REEL DE 3-4 PLANOS:",
          "  · Plano 1 (gancho) — Golpe seco en 2 segundos: una afirmación provocadora, un dato contraintuitivo o una promesa fuerte. Debe romper el scroll. Cuenta también el ENCUADRE (Ales primer plano a cámara, foto tumbado, plano detalle de la mano, texto grande sobre b-roll…).",
          "  · Plano 2 (contexto/giro) — Amplía o gira: 'porque casi todo el mundo…', 'y ahí está el error…'. Introduce el conflicto o la creencia limitante que ataca la semana.",
          "  · Plano 3 (prueba/aha) — El insight, el caso real, la analogía, el ejemplo. Aquí se entiende POR QUÉ.",
          "  · Plano 4 (cierre/CTA, si hay 4) — Frase de salida + llamada concreta (comenta 'X', DM 'HOMBRO', enlace bio…). Puede fusionarse con el plano 3 si con 3 basta.",
          "",
          "CADA PLANO DEBE INCLUIR:",
          "  · Encuadre visual concreto (primer plano, plano detalle, B-roll de gym, texto sobre pantalla, cortes rápidos…).",
          "  · La IDEA de lo que se cuenta en 1-3 líneas, específica, no genérica.",
          "  · Cuando aplique: el gesto, el prop, la localización, o el gráfico que refuerza la idea.",
          "",
          "REGLAS DE CALIDAD — LEE Y APLICA:",
          "  · Nada de 'presenta el problema', 'explica cómo', 'muestra los pasos', 'invita a comentar'. Son placeholders vacíos, NO planos.",
          "  · Concreto siempre. Si dices 'un ejemplo', dilo cuál. Si dices 'un dato', dilo cuál.",
          "  · Nombra emociones (rabia, alivio, frustración, incredulidad) y momentos reales del atleta, no arquetipos.",
          "  · Cero jerga médica en el content (no 'discopatía', no 'tenosinovitis crónica'). Escríbelo como se lo contarías a un atleta en el box.",
          "  · Prohibido repetir el hook literal en el plano. Los planos DESARROLLAN el hook, no lo copian.",
          "  · Prohibidas frases con 'la persona', 'el paciente', 'el usuario'. Habla del atleta directamente o en segunda persona.",
          "",
          "EJEMPLOS DE PLANOS BUENOS (imita el nivel de concreción):",
          "  · 'Plano 1 — Primer plano de Ales sujetando una kettlebell a la altura del hombro, mirada retadora. Suelta la afirmación que rompe el mito de la semana ('el reposo NO cura tu hombro') con corte seco a plano medio antes de terminar la frase para forzar el enganche.'",
          "  · 'Plano 2 — B-roll de un atleta haciendo strict press mientras texto grande cae en pantalla: '4 semanas parado = 4 semanas retrocediendo'. Ales en voz en off explica por qué el descanso pasivo atrofia justo lo que quieres recuperar, sin llegar a la solución todavía.'",
          "  · 'Plano 3 — Ales en el box junto a Miriam (paciente real ADVANCE) haciendo el ejercicio concreto que le devolvió el overhead. Cuenta el momento en el que ella dejó de tenerle miedo al hombro. La prueba en vídeo cierra la creencia.'",
          "  · 'Plano 4 — Ales frontal, plano medio, cierre directo: quien esté igual de estancado que Miriam, que comente HOMBRO y le llega el mini-programa gratuito. Sin música al final para que el CTA respire.'",
          "",
          "Para carousel/infographic/image/live NO devuelvas blocks (o devuelve array vacío).",
        ].join("\n")
      : [
          "MODO SIN GUION:",
          "NO redactes el guion por planos. NO devuelvas el campo `blocks` en ninguna pieza (o devuélvelo como array vacío).",
          "Solo hook + título + goals + rationale por pieza. El CEO va a redactar el guion a mano cuando le toque, así que céntrate en calidad del hook y variedad de ángulos entre piezas.",
        ].join("\n"),
  ].join("\n");
}

function buildUserPrompt(input: {
  brief: string;
  targetDate?: string;
  startWeek?: string;
  weeksAhead: number;
  piecesPerWeek?: Record<string, number>;
  recentThemes: string[];
}): string {
  const mixEntries = input.piecesPerWeek
    ? Object.entries(input.piecesPerWeek).filter(([, n]) => n && n > 0)
    : [];
  const mix = mixEntries.length > 0
    ? mixEntries.map(([f, n]) => `${n}× ${f}`).join(" + ")
    : "libre — decide tú la mezcla óptima";
  const piecesPerWeek = mixEntries.reduce((sum, [, n]) => sum + Number(n), 0);
  const strictLine = mixEntries.length > 0
    ? `\nOBLIGATORIO: cada semana debe tener EXACTAMENTE ${piecesPerWeek} piezas con esta distribución: ${mix}. Antes de devolver la tool, cuenta las piezas de cada formato por semana y verifica que coincide. No devuelvas menos aunque creas que sobra alguna.`
    : "";
  const themesLine = input.recentThemes.length > 0
    ? `\n\nTEMAS RECIENTES YA TRATADOS (evita repetirlos exactos):\n${input.recentThemes.slice(0, 12).map((t) => `- ${t}`).join("\n")}`
    : "";
  const startLine = input.startWeek
    ? `a partir del lunes ${input.startWeek}`
    : "a partir del próximo lunes";
  return [
    `BRIEF DEL CEO:\n${input.brief.trim()}`,
    input.targetDate ? `\nFECHA OBJETIVO (lanzamiento): ${input.targetDate}` : "",
    `\nHORIZONTE: ${input.weeksAhead} semana${input.weeksAhead === 1 ? "" : "s"} ${startLine}.`,
    `\nMEZCLA POR SEMANA: ${mix}`,
    strictLine,
    themesLine,
    "\n\nGenera la estrategia usando la herramienta `submit_strategy`.",
  ].join("");
}

async function handle(req: NextRequest) {
  try {
    return await runGenerate(req);
  } catch (e: any) {
    // Cinturón + tirantes: cualquier throw fuera del try interno cae aquí
    // en JSON para que el cliente no reciba "An error occurred..." de HTML.
    console.error("[marketer/generate] top-level error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Error inesperado generando estrategia" },
      { status: 500 },
    );
  }
}

async function runGenerate(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const briefText = typeof body?.brief === "string" ? body.brief.trim() : "";
  if (briefText.length < 10) {
    return NextResponse.json({ error: "Escribe un brief más detallado (mínimo 10 caracteres)" }, { status: 400 });
  }

  // PDF opcional adjuntado por el CEO ("aquí tienes el plan estratégico
  // del trimestre, hazlo cuadrar"). Se pasa como base64 desde el cliente,
  // sin cabecera data:. Anthropic acepta PDFs hasta 32MB / 100 páginas
  // como bloque `document` — validamos aquí un techo pragmático de 10MB
  // para evitar body huge en el POST.
  const pdfBase64 = typeof body?.pdfBase64 === "string" ? body.pdfBase64.trim() : "";
  const pdfName = typeof body?.pdfName === "string" ? body.pdfName.trim().slice(0, 200) : "";
  if (pdfBase64) {
    const approxBytes = Math.ceil((pdfBase64.length * 3) / 4);
    if (approxBytes > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: "El PDF supera los 4 MB. Comprímelo o divide el documento." },
        { status: 400 },
      );
    }
  }
  const weeksAhead = Math.max(1, Math.min(8, Math.round(Number(body?.weeksAhead) || 2)));
  const targetDate = typeof body?.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.targetDate)
    ? body.targetDate
    : undefined;
  const startWeek = typeof body?.startWeek === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startWeek)
    ? body.startWeek
    : undefined;
  const piecesPerWeek = (body?.piecesPerWeek && typeof body.piecesPerWeek === "object")
    ? body.piecesPerWeek
    : undefined;
  // Con guion (default true) → la IA redacta blocks para cada reel. Sin guion
  // → solo hook + título; el CEO redacta a mano después. Ahorra tokens y da
  // tiradas rápidas de ideas.
  const includeScript = body?.includeScript !== false;

  // Contexto: temas recientes ya tratados (últimas 6 semanas) para evitar repetir.
  const recentWeeks = await prisma.contentWeek.findMany({
    orderBy: { startDate: "desc" },
    take: 6,
    select: { centralTheme: true, bodyZone: true },
  });
  const recentThemes = recentWeeks
    .map((w) => w.centralTheme?.trim())
    .filter((t): t is string => !!t);

  const brief = await getAiBrief();

  // Tool para forzar JSON estructurado.
  const tool: Anthropic.Tool = {
    name: "submit_strategy",
    description: "Envía la estrategia de contenido propuesta al panel del CEO.",
    input_schema: {
      type: "object",
      required: ["strategy", "weeks"],
      properties: {
        strategy: { type: "string", description: "Resumen del arco narrativo (2-4 frases)." },
        weeks: {
          type: "array",
          items: {
            type: "object",
            required: ["weekOffset", "centralTheme", "bodyZone", "weekType", "pieces"],
            properties: {
              weekOffset: { type: "number", description: "0 = semana que viene, 1 = la siguiente..." },
              centralTheme: { type: "string" },
              bodyZone: { type: "string", description: "Ej. hombro, rodilla, lumbar, mixta" },
              weekType: {
                type: "string",
                enum: ["educativa", "objeciones", "lanzamiento", "recuperacion"],
              },
              limitingBeliefs: {
                type: "array",
                items: { type: "string" },
                description: "Creencias limitantes que se atacan esta semana",
              },
              pieces: {
                type: "array",
                items: {
                  type: "object",
                  required: ["dayOfWeek", "format", "title", "hook", "goals", "rationale"],
                  properties: {
                    dayOfWeek: { type: "number", description: "1=Lun ... 7=Dom" },
                    format: {
                      type: "string",
                      enum: ["reel", "carousel", "infographic", "image", "live"],
                    },
                    title: { type: "string" },
                    hook: { type: "string" },
                    goals: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: ["atraer", "conectar", "educar", "convertir", "lanzamiento"],
                      },
                    },
                    rationale: { type: "string" },
                    blocks: {
                      type: "array",
                      description:
                        "Obligatorio para format=reel: 3-4 planos con la IDEA a transmitir (no frase literal). Vacío para otros formatos.",
                      items: {
                        type: "object",
                        required: ["label", "content"],
                        properties: {
                          label: {
                            type: "string",
                            description: "Plano 1, Plano 2, Plano 3 o Plano 4 (en ese orden).",
                          },
                          content: {
                            type: "string",
                            description: "Idea del plano en 1-3 líneas. No frase literal.",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const userText = buildUserPrompt({
    brief: briefText,
    targetDate,
    startWeek,
    weeksAhead,
    piecesPerWeek,
    recentThemes,
  });

  // Si el CEO adjuntó un PDF, lo mandamos como bloque `document` antes
  // del texto — Claude lo lee entero y usa su contenido como contexto
  // primario. El texto va después, así el brief manda sobre el PDF cuando
  // hay conflicto.
  const userContent: Anthropic.MessageParam["content"] = pdfBase64
    ? [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: pdfBase64,
          },
          title: pdfName || undefined,
          // Cache del PDF: si el CEO reintenta con el mismo PDF y ajusta
          // el brief, no volvemos a pagar la ingesta del PDF completo.
          cache_control: { type: "ephemeral" },
        } as any,
        { type: "text", text: userText },
      ]
    : userText;

  try {
    const msg = await client().messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt(brief, includeScript),
      tools: [tool],
      tool_choice: { type: "tool", name: "submit_strategy" },
      messages: [{ role: "user", content: userContent }],
    });

    // Extraer el tool_use.
    const toolUse = msg.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    if (!toolUse) {
      // Log del contenido devuelto por Claude cuando no llama a la tool —
      // útil para diagnosticar si soltó texto suelto en vez del tool_use.
      const textFallback = msg.content
        .filter((c): c is Anthropic.TextBlock => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .slice(0, 500);
      console.warn("[marketer/generate] IA sin tool_use. Text fallback:", textFallback);
      return NextResponse.json({ error: "La IA no devolvió estrategia (no llamó a la tool)" }, { status: 502 });
    }
    const parsed = toolUse.input as any;
    const weeksOut: unknown[] = Array.isArray(parsed.weeks) ? parsed.weeks : [];

    // Si el modelo llegó al techo de tokens, `parsed` queda con JSON parcial
    // (a menudo weeks vacío) y el UI mostraría "0 piezas" sin explicación.
    // Devolvemos error visible para que el CEO sepa reducir alcance o
    // reintentar. stop_reason "end_turn" o "tool_use" = OK; "max_tokens" = corte.
    if (msg.stop_reason === "max_tokens" && weeksOut.length === 0) {
      console.warn("[marketer/generate] max_tokens sin semanas usables", {
        max: MAX_OUTPUT_TOKENS,
        usage: msg.usage,
      });
      return NextResponse.json(
        {
          error:
            "La estrategia se cortó por longitud. Prueba con menos semanas o menos piezas por semana.",
        },
        { status: 502 },
      );
    }

    // Verificación de mezcla: si el CEO pidió un reparto concreto, contamos
    // por formato y por semana. Si alguna semana no cumple, devolvemos un
    // warning para que la UI lo pinte visible (no rechazamos — la
    // estrategia sigue siendo útil aunque falte una pieza).
    let mixWarning: string | null = null;
    if (body?.piecesPerWeek && typeof body.piecesPerWeek === "object") {
      const expected: Record<string, number> = {};
      for (const [k, v] of Object.entries(body.piecesPerWeek as Record<string, unknown>)) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) expected[k] = Math.round(n);
      }
      const problems: string[] = [];
      for (const w of weeksOut) {
        const pieces = Array.isArray((w as any)?.pieces) ? (w as any).pieces : [];
        const got: Record<string, number> = {};
        for (const p of pieces) {
          const f = String((p as any)?.format ?? "");
          if (!f) continue;
          got[f] = (got[f] ?? 0) + 1;
        }
        for (const [f, exp] of Object.entries(expected)) {
          const g = got[f] ?? 0;
          if (g !== exp) {
            problems.push(`Semana ${((w as any)?.weekOffset ?? 0) + 1}: ${g}/${exp} ${f}`);
          }
        }
      }
      if (problems.length > 0) {
        mixWarning = `La IA no cumplió la mezcla exacta pedida — ${problems.join(" · ")}. Puedes reintentar si quieres el reparto exacto.`;
      }
    }

    return NextResponse.json({
      ok: true,
      strategy: String(parsed.strategy ?? ""),
      weeks: weeksOut,
      warning: mixWarning,
    });
  } catch (e: any) {
    console.error("[marketer/generate] Anthropic error:", e?.message ?? e);
    return NextResponse.json(
      { error: e?.message ?? "Error llamando a la IA" },
      { status: 500 },
    );
  }
}

export { handle as POST };
