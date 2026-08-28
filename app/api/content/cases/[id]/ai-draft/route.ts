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

const SYSTEM_PROMPT = `Eres un fisioterapeuta senior de FisioFit Team redactando un CASO CLINICO NARRATIVO a partir de todo el historial de un paciente. El caso se usara despues como material de contenido publico (reels, carruseles, testimonios), asi que debe ser humano, honesto y clinicamente solido.

Recibiras un JSON con: datos del paciente, notas del fisio, notas de la llamada de anamnesis, anamnesis en JSON, adherencia y sensaciones ricas del atleta ordenadas cronologicamente, metricas clinicas (valores primero-ultimo, min, max), tendencias del daily-log, alertas IA generadas, y resumenes semanales anteriores.

Devuelve EXCLUSIVAMENTE llamando a la tool "submit_case", con estos 4 apartados:

1. initialSituation — "Como estaba / dolor principal": punto de partida clinico y emocional. Que le pasaba, desde cuando, que habia hecho antes, hallazgos objetivos (si existen), estado emocional, impacto en su deporte.

2. process — "Como ha sido su proceso": el arco del tratamiento. Fases, hitos importantes, adaptaciones puntuales (picos de carga, reagudizaciones, problemas secundarios, interrupciones externas). Como fue respondiendo el paciente. Su adherencia.

3. obstacles — "Que dificultades o creencias ha tenido que superar": barreras psicologicas y practicas. Frustracion inicial, miedo al movimiento, hipervigilancia, impulsividad competitiva, creencias limitantes que soltar. USA sub-bullets con titulos en negrita si hay varias barreras claras.

4. achievements — "Que ha conseguido y como se siente ahora": recuperacion objetiva (funcionalidad, cargas, competiciones, PRs) + subjetiva (como se siente el paciente, aprendizajes que se lleva).

5. shortSummary — resumen ULTRA CORTO (max 200 caracteres, 1-2 frases) para mostrar en cards del banco de recursos. Formato: "[Nombre] · [lesion/situacion] → [logro/estado actual]". Ej: "Oscar · rotura supraespinoso + bursitis → recuperado, snatch 80%, MU sin dolor". NO uses adjetivos vacios, solo hechos.

REGLAS ESTRICTAS:
- ESCRIBE EN TERCERA PERSONA. "El paciente", "Oscar", "Ana", etc. NUNCA en primera persona del atleta.
- USA CITAS DEL PACIENTE entre comillas cuando salgan de las sensaciones o notas ("me siento jodido", "como nuevo"). Nunca inventes citas.
- NO inventes datos clinicos. Si no hay ecografia, no la nombres. Si no hay tests, no los cites. Solo lo que aparezca en el JSON.
- NO uses jerga medica que un lego no entienda sin traducir. Escribe para redes sociales medicamente serias, no para un congreso.
- LA LONGITUD depende de la RIQUEZA DE DATOS:
    * <20 sesiones + poca info: 1-2 parrafos por apartado, texto continuo sin sub-bullets.
    * 20-60 sesiones + sensaciones ricas + resumenes semanales: 2-3 parrafos por apartado con sub-bullets en "obstaculos".
    * >60 sesiones + varios meses + mucha info: parrafos largos como el PDF de Oscar Saurina, sub-bullets con negrita en los 4 apartados si hay que estructurar.
- NUNCA uses markdown ni HTML — devuelve TEXTO PLANO con saltos de linea. Los sub-bullets van como lineas que empiezan por "- " o "• ".
- Los TITULOS EN NEGRITA dentro de sub-bullets se marcan con **texto** (asteriscos dobles).
- NO uses emojis, salvo si aparecen en las notas originales del paciente.
- EL TONO: profesional pero calido. Como el fisio hablando de su atleta con orgullo. NO adjetivos vacios ("brutal", "epico"). NO promesas magicas.
- Si el JSON tiene MUY POCOS datos como para redactar honestamente, deja un apartado como texto breve indicando que "aun no hay suficiente informacion registrada" y sugiere que el fisio lo escriba a mano. No inventes.
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
