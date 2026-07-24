/**
 * Predicado compartido para "esta ProgramSession completada tiene un
 * formulario RELLENADO por el paciente pendiente de que el fisio lo revise".
 *
 * Reglas:
 * - El snapshot contiene al menos una tarea type="FORM".
 * - Para al menos una de esas tareas, hay una respuesta guardada NO vacia
 *   y NO marcada como skipped/dismissed (los sentinels que ponemos cuando
 *   el fisio pide dispensar el form desde admin, o cuando el paciente
 *   marco "hecho fuera de app").
 *
 * De este modo, formularios que quedaron sin rellenar o dispensados no
 * aparecen como pendientes de revisar (que es lo que confundia a los
 * fisios porque veian el recuadro vacio despues de pulsar).
 */
type MinimalSession = {
  tasksSnapshot: string;
  responses: string | null;
};

export function hasPendingFormReview(session: MinimalSession): boolean {
  let tasks: any[] = [];
  try {
    const parsed = JSON.parse(session.tasksSnapshot);
    if (Array.isArray(parsed)) tasks = parsed;
  } catch { return false; }

  let responses: Record<string, any> = {};
  if (session.responses) {
    try { responses = JSON.parse(session.responses); } catch { responses = {}; }
  }

  const forms = tasks.filter((t) => t?.type === "FORM");
  if (forms.length === 0) return false;

  for (const f of forms) {
    const r = responses[f.id];
    if (r === undefined || r === null) continue;
    if (typeof r === "object") {
      // Placeholder de "skipped" que metimos en el fix del banner atrapado.
      if ((r as any).__skipped === true) continue;
      if (Object.keys(r as Record<string, any>).length === 0) continue;
      return true;
    }
    if (typeof r === "string" && r.trim() === "") continue;
    return true;
  }
  return false;
}

/**
 * Extrae array de preguntas del snapshot de una tarea FORM.
 * Los snapshots modernos guardan `questions` ya como array; los legacy
 * como string JSON. Aceptamos ambos y devolvemos siempre array (o vacio).
 */
export function parseFormQuestions(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  }
  return [];
}
