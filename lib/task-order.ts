/**
 * Utilidades para trabajar con el orden de tareas dentro de una sesión.
 *
 * El editor de sesión del fisio (EditSessionModal) permite reordenar tareas
 * con ↑ / ↓, y al guardar reasigna el campo `order` de cada tarea a su
 * índice actual (0, 1, 2, …). Todas las vistas del paciente deben respetar
 * ese orden — este helper centraliza el sort defensivo para evitar que se
 * nos escape ninguna vista.
 */

export function sortTasksByOrder<T extends { order?: number | null }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Parsea el JSON tasksSnapshot de una ProgramSession y devuelve las tareas
 * ordenadas. Si el JSON es inválido devuelve un array vacío.
 */
export function parseAndSortTasksSnapshot(snapshot: string): any[] {
  try {
    const arr = JSON.parse(snapshot);
    if (!Array.isArray(arr)) return [];
    return sortTasksByOrder(arr);
  } catch {
    return [];
  }
}
