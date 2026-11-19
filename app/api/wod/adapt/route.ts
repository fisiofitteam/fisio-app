import { NextRequest, NextResponse } from "next/server";
import { parseWod, adaptWod } from "@/lib/wodParser";
import { aiWodConfigured, parseWodWithAI } from "@/lib/ai-wod";
import { requireWodPatient, requestedWodReadiness, WodRequestError } from "@/lib/patient-wod-access";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new WodRequestError(400, "WOD no válido.");
    const patient = await requireWodPatient(body.patientId);
    const readiness = requestedWodReadiness(patient.programType, body.readiness);
    const rawText = typeof body.rawText === "string" ? body.rawText.trim() : "";
    if (!rawText || rawText.length > 20000)
      throw new WodRequestError(400, "Escribe un WOD de hasta 20.000 caracteres.");

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

    const adapted = await adaptWod(parsed, patient.id, readiness);
    const source = aiLines.length > 0
      ? (extraFromHeuristic.length > 0 ? "ai+heuristic" : "ai")
      : "heuristic";
    return NextResponse.json({ lines: adapted, source, readiness }, { headers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof WodRequestError ? error.message : "No se ha podido adaptar el WOD. Inténtalo de nuevo." },
      { status: error instanceof WodRequestError ? error.status : 500, headers },
    );
  }
}
