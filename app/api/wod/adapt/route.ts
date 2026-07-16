import { NextRequest, NextResponse } from "next/server";
import { parseWod, adaptWod } from "@/lib/wodParser";
import { aiWodConfigured, parseWodWithAI } from "@/lib/ai-wod";

export async function POST(req: NextRequest) {
  const { patientId, rawText } = await req.json();
  if (!patientId || !rawText) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  // Estrategia: parseamos con Claude (mucho más robusto a abreviaturas,
  // castellano y variantes) Y con el heurístico. Combinamos los dos:
  // Claude aporta las líneas ricas (con relatedMovementIds y buenas
  // reps/carga); el heurístico rellena movimientos que la IA se saltó
  // (safety-net contra alucinaciones y skips). Si la IA falla, el
  // heurístico se queda solo.
  let aiLines: Awaited<ReturnType<typeof parseWod>> = [];
  if (aiWodConfigured()) {
    try { aiLines = await parseWodWithAI(rawText); }
    catch (e) { console.error("[wod/adapt] IA falló, sigo con heurístico:", e); }
  }
  const heurLines = await parseWod(rawText);

  // Merge: partimos de la IA y añadimos del heurístico los movementIds que
  // la IA NO detectó. Evita perder ejercicios comunes (burpees, ring dips)
  // por skips del LLM. Nota: si un WOD repite dos veces el mismo mov, la
  // IA suele devolver ambas entradas — el filtro por Set evita añadir
  // duplicados extra desde el heurístico.
  const aiIds = new Set(aiLines.map((l) => l.matchedMovementId).filter(Boolean));
  const extraFromHeuristic = heurLines.filter(
    (l) => l.matchedMovementId && !aiIds.has(l.matchedMovementId)
  );
  const parsed = aiLines.length > 0
    ? [...aiLines, ...extraFromHeuristic]
    : heurLines;

  const adapted = await adaptWod(parsed, patientId);
  const source = aiLines.length > 0
    ? (extraFromHeuristic.length > 0 ? "ai+heuristic" : "ai")
    : "heuristic";
  return NextResponse.json({ lines: adapted, source });
}
