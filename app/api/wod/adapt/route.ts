import { NextRequest, NextResponse } from "next/server";
import { parseWod, adaptWod } from "@/lib/wodParser";
import { aiWodConfigured, parseWodWithAI } from "@/lib/ai-wod";

export async function POST(req: NextRequest) {
  const { patientId, rawText } = await req.json();
  if (!patientId || !rawText) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  // Estrategia: si tenemos API key de Anthropic, parseamos con Claude (mucho más
  // robusto a abreviaturas, castellano, variantes...). Si la IA falla por cualquier
  // motivo (red, formato inesperado, sin matches), caemos al parser heurístico.
  let parsed = [] as Awaited<ReturnType<typeof parseWod>>;
  let usedAi = false;
  if (aiWodConfigured()) {
    try {
      const aiLines = await parseWodWithAI(rawText);
      if (aiLines.length > 0) {
        parsed = aiLines;
        usedAi = true;
      }
    } catch (e) {
      console.error("[wod/adapt] IA falló, fallback al heurístico:", e);
    }
  }
  if (!usedAi) {
    parsed = await parseWod(rawText);
  }

  const adapted = await adaptWod(parsed, patientId);
  return NextResponse.json({ lines: adapted, source: usedAi ? "ai" : "heuristic" });
}
