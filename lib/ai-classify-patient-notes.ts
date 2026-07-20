/**
 * Clasificador IA de "sensaciones del paciente" post-sesion.
 *
 * Recibe el texto libre que el paciente escribio al completar la sesion
 * (ProgramSession.patientNotes) y devuelve una lectura estructurada que
 * el sistema de alertas usa para decidir si tiene que llamar la atencion
 * del fisio.
 *
 * Modelo: Haiku 4.5 — barato, rapido, sobrado para este tipo de clasificacion.
 *
 * Si la API no esta configurada o falla, la funcion devuelve null y el
 * caller trata el resultado como "no analizado" (no se crea alerta pero
 * tampoco se rompe el flujo de completar sesion).
 */

export type NoteClassification = {
  // Sentimiento general: positivo (fue bien), neutro (ni fu ni fa), negativo
  // (algo malo). Usado para posibles agregados futuros.
  sentiment: "positive" | "neutral" | "negative";
  // Cuanta atencion merece el fisio:
  //   info → no requiere accion (nota rutinaria, positiva o queja leve).
  //   warn → algo relevante (molestia moderada, frustracion, patron raro).
  //   high → urgente (dolor agudo, lesion, empeoramiento claro, riesgo).
  severity: "info" | "warn" | "high";
  // Resumen de 1 linea (<=120 chars) para pintar en la lista de alertas
  // sin que el fisio tenga que abrir el detalle.
  summary: string;
  // Etiquetas cortas de topico ("dolor lumbar", "insomnio", "frustracion"...).
  // Opcional — pueden estar vacias. Sirven para futuros filtros.
  topics: string[];
};

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `Eres un asistente clinico que ayuda a fisioterapeutas a triar sensaciones post-sesion de sus pacientes.

Recibiras: una nota escrita por el paciente al terminar su sesion (texto libre en español).

Devuelve EXCLUSIVAMENTE un JSON valido (sin texto antes ni despues, sin code fences) con esta forma:

{
  "sentiment": "positive" | "neutral" | "negative",
  "severity": "info" | "warn" | "high",
  "summary": "<=120 chars, resumen en 1 linea",
  "topics": ["dolor lumbar", "sueño"]
}

Reglas de severidad:
- info: nota rutinaria, sensacion buena, cansancio esperado, quejas menores tipo "un poco de agujetas".
- warn: molestia moderada, dolor leve nuevo, patron llamativo (varios dias mala racha), frustracion clara, dudas del paciente sobre si algo va bien.
- high: dolor agudo, lesion sospechada, empeoramiento marcado, palabras como "no puedo", "me quede tirado", "muchisimo dolor", riesgo real para la salud, dolor en zona nueva sin explicacion.

Reglas de summary:
- Empieza por el hecho clave ("Dolor lumbar al hacer sentadilla", "Sensacion muy buena tras el bloque", "Le costo dormir 2 noches seguidas").
- Nada de "el paciente dice que…" — directo.
- Español, minusculas al inicio salvo nombres propios.

Reglas de topics:
- 0 a 4 etiquetas cortas ("dolor lumbar", "insomnio", "fatiga", "hombro", "motivacion baja"…).
- Si no hay topico claro, [].

Cuando dudes entre dos niveles de severidad, sube al superior — es mejor una alerta de mas que perder un caso.`;

export async function classifyPatientNote(note: string): Promise<NoteClassification | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const trimmed = note.trim();
  if (!trimmed) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: trimmed }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return normalize(parsed);
  } catch {
    return null;
  }
}

function normalize(raw: any): NoteClassification | null {
  if (!raw || typeof raw !== "object") return null;
  const sentiment = raw.sentiment === "positive" || raw.sentiment === "negative" ? raw.sentiment : "neutral";
  const severity = raw.severity === "warn" || raw.severity === "high" ? raw.severity : "info";
  const summary = typeof raw.summary === "string" ? raw.summary.slice(0, 200).trim() : "";
  const topics = Array.isArray(raw.topics)
    ? raw.topics.filter((t: any): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 4)
    : [];
  if (!summary) return null;
  return { sentiment, severity, summary, topics };
}
