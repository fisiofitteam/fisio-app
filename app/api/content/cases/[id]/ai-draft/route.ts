/**
 * POST /api/content/cases/[id]/ai-draft
 *
 * Genera el borrador narrativo del caso clinico (4 apartados estilo PDF
 * de Oscar Saurina) usando Sonnet 4.6 y toda la info del paciente.
 *
 * NO recibe body — todo se saca del ClinicalCase.patientId y su Patient.
 * NO toca los videos ni el consentimiento — solo escribe los 4 textos.
 *
 * Sonnet decide la longitud segun la riqueza de datos. Si el paciente
 * apenas tiene sesiones, el borrador sera corto; si tiene sensaciones
 * ricas, resumenes semanales y metricas, sera largo tipo PDF Oscar.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { buildClinicalCaseContext } from "@/lib/clinical-case-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 5000;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada.");
  _client = new Anthropic({ apiKey });
  return _client;
}

const SYSTEM_PROMPT = `Eres un fisioterapeuta senior de FisioFit Team contando la HISTORIA de un atleta que salio adelante. No es una ficha clinica, no es un informe medico — es un relato HUMANO Y EMOCIONAL que despues se usa en redes sociales para conectar con otras personas que estan pasando por lo mismo.

Recibiras un JSON con: datos del paciente, notas del fisio, sensaciones del atleta a lo largo del proceso, metricas de evolucion, alertas y resumenes semanales. USA todo eso como CONTEXTO para entender su historia — pero NO lo vueques literalmente en el texto.

Devuelve EXCLUSIVAMENTE llamando a la tool "submit_case", con estos 4 apartados:

1. initialSituation — "Como estaba / dolor principal": donde estaba antes de empezar. Que le pasaba, como se sentia, que temia perder (su deporte, su rutina, sus objetivos), la sensacion de no encontrar salida despues de haber probado otras cosas. Emocion sobre datos: como VIVIA el dolor, no solo que dolor tenia.

2. process — "Como ha sido su proceso": el viaje que ha hecho. El descubrir que si habia camino. Los primeros dias con miedo, las semanas donde empezo a fiarse, los momentos duros y los pequeños hitos que le devolvieron la confianza. Cuenta la EXPERIENCIA humana, no el protocolo tecnico.

3. obstacles — "Obstaculos y miedos que ha tenido que superar": el ruido mental. La frustracion, el miedo a recaer, la impaciencia, el sindrome del impostor, la envidia de ver a otros al 100%, la sensacion de "esto no se me va a curar nunca". Todos tenemos monstruos — nombralos. USA sub-bullets con **titulos en negrita** si hay varios miedos claros.

4. achievements — "Que ha conseguido y como se siente ahora": no solo lo que hace ahora, sino como lo VIVE. El alivio, la sorpresa de volver a hacer cosas que daba por perdidas, la seguridad recuperada, lo que se lleva mas alla del deporte. Los datos duros (kilos, competicion, movimiento X) van al final como cierre concreto, no como titular.

5. shortSummary — resumen ULTRA CORTO (max 200 caracteres, 1-2 frases) para tarjetas del banco. Emocional: "[Nombre] llego bloqueado por [dolor/miedo] y ahora [logro humano]". Ej: "Oscar llego pensando que se olvidaba del CrossFit y ahora vuelve a competir sin miedo al hombro." NO uses "%", ni escalas 7/10, ni nombres tecnicos.

REGLAS ESTRICTAS DE ESTILO — LEE DOS VECES:
- ESCRIBE EN TERCERA PERSONA. "El paciente", "Oscar", "Ana". Nunca primera persona del atleta.
- **NO USES NUMEROS DE ESCALAS** ("dolor 7/10", "rigidez 5/10", "RPE 8"). Traducelos a lenguaje humano: "dolor fuerte que le limitaba", "rigidez que sentia al levantarse", "esfuerzo maximo cada dia". Los numeros clinicos ROMPEN la narrativa.
- **NO CITES NOMBRES TECNICOS DE PROGRAMAS** ("CONSOLIDA 6M", "RECUPERA", "ADVANCE", "PREVENTION"). Di "empezo su programa", "cuando entro con nosotros", "el proceso de recuperacion", "el plan que le hicimos".
- **NO USES JERGA MEDICA PURA** ("bursitis subacromio-subdeltoidea", "rotura longitudinal del supraespinoso 1,2 cm"). Si hay diagnostico, traducelo: "una lesion en el hombro que le impedia levantar peso por encima de la cabeza". Los detalles clinicos SOLO si son necesarios para entender el caso, y siempre en lenguaje llano.
- **CITAS DEL PACIENTE SON EL ORO**: cuando en las notas aparezcan frases como "me siento jodido", "como nuevo", "esto no se me pasa" — usalas literales entre comillas. Son las que emocionan. Si no hay citas, no inventes.
- La HISTORIA emociona, los datos aburren. Cuenta primero el sentimiento, luego el hecho.
- Datos duros SOLO cuando aportan cierre narrativo y sin cifras exactas: "levanta pesos parecidos a los que hacia antes", "ha vuelto a competir", "ha terminado un 10k" — no "levanta 82 kg de snatch, 4x3 al 80% del 1RM".
- LA LONGITUD depende del material disponible:
    * <20 sesiones + poca info: 1-2 parrafos por apartado.
    * 20-60 sesiones + sensaciones ricas: 2-3 parrafos con sub-bullets en "obstaculos".
    * >60 sesiones + varios meses: parrafos mas amplios, sub-bullets con negrita cuando ayude a leer.
- NUNCA uses markdown ni HTML — TEXTO PLANO con saltos de linea. Sub-bullets como lineas que empiezan por "- ".
- TITULOS EN NEGRITA dentro de sub-bullets: **texto**.
- NO uses emojis, salvo si aparecen en las notas originales del paciente.
- TONO: profesional pero calido. Como el fisio hablando de su atleta con orgullo. Cero adjetivos vacios ("brutal", "epico", "insano", "increible"). Cero promesas magicas.
- Si el JSON tiene MUY POCOS datos, deja un apartado breve indicando que "aun no hay suficiente informacion registrada" y que el fisio lo escriba a mano. No inventes.
- NO propongas "vídeos" ni cierres los apartados con "Video:" — los videos los mete el fisio despues.`;

function buildUserPrompt(ctx: any): string {
  return [
    "CONTEXTO DEL PACIENTE (usa solo lo que aparece aqui, no inventes):",
    JSON.stringify(ctx, null, 2),
    "",
    "Redacta los 4 apartados y llama a submit_case. Longitud auto segun la riqueza.",
  ].join("\n");
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const caseRow = await (prisma as any).clinicalCase.findUnique({ where: { id: params.id } });
  if (!caseRow) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
  if (!caseRow.patientId) {
    return NextResponse.json({ error: "El caso no tiene paciente asociado" }, { status: 400 });
  }

  const ctx = await buildClinicalCaseContext(caseRow.patientId);
  if (!ctx) return NextResponse.json({ error: "No se pudo cargar el contexto del paciente" }, { status: 500 });

  const tool: Anthropic.Tool = {
    name: "submit_case",
    description: "Guarda el caso clinico narrativo con los 4 apartados + resumen corto.",
    input_schema: {
      type: "object",
      required: ["initialSituation", "process", "obstacles", "achievements", "shortSummary"],
      properties: {
        initialSituation: { type: "string", description: "Como estaba / dolor principal." },
        process: { type: "string", description: "Como ha sido su proceso." },
        obstacles: { type: "string", description: "Dificultades o creencias superadas." },
        achievements: { type: "string", description: "Que ha conseguido y como se siente ahora." },
        shortSummary: { type: "string", description: "Resumen ultra corto de 1-2 frases (max 200 chars) para cards del banco." },
      },
    },
  };

  try {
    const msg = await client().messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [tool],
      tool_choice: { type: "tool", name: "submit_case" },
      messages: [{ role: "user", content: buildUserPrompt(ctx) }],
    });

    const toolUse = msg.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    if (!toolUse) {
      return NextResponse.json({ error: "La IA no devolvio el caso (sin tool_use)" }, { status: 502 });
    }
    const parsed = toolUse.input as any;
    const initialSituation = String(parsed.initialSituation ?? "").trim();
    const process = String(parsed.process ?? "").trim();
    const obstacles = String(parsed.obstacles ?? "").trim();
    const achievements = String(parsed.achievements ?? "").trim();
    const shortSummary = String(parsed.shortSummary ?? "").trim().slice(0, 300);

    if (!initialSituation || !process || !obstacles || !achievements) {
      return NextResponse.json({ error: "La IA devolvio apartados vacios" }, { status: 502 });
    }

    const updated = await (prisma as any).clinicalCase.update({
      where: { id: caseRow.id },
      data: {
        initialSituation,
        process,
        obstacles,
        achievements,
        shortSummary: shortSummary || null,
        aiDraftedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      caseId: updated.id,
      initialSituation,
      process,
      obstacles,
      achievements,
      shortSummary,
    });
  } catch (e: any) {
    console.error("[cases/ai-draft]", e);
    return NextResponse.json(
      { error: e?.message ?? "Error generando el caso con IA" },
      { status: 500 },
    );
  }
}
