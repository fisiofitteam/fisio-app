/**
 * Detecta si un paciente tiene tareas de tipo FORM sin rellenar en alguna
 * de sus sesiones. Se usa para pintar un banner persuasivo en el home
 * pidiéndole que las complete.
 *
 * Criterio: en cualquier ProgramSession del paciente (fecha pasada, presente
 * o futura) existe una tarea de tipo FORM que NO tiene una respuesta guardada
 * en el campo `responses` de la sesión. Aplica tanto si la sesión está
 * completada como si no — el paciente puede haber terminado un workout sin
 * pararse a rellenar el formulario.
 *
 * Devuelve la lista ordenada por fecha ascendente (más antigua primero) para
 * que el banner priorice lo que lleva más tiempo pendiente.
 */
import { prisma } from "@/lib/prisma";

export type PendingForm = {
  sessionId: string;
  scheduledDate: string; // ISO
  formTitle: string;     // título del FORM (o de la sesión si no)
  programName: string;
};

export async function getPendingFormsForPatient(patientId: string): Promise<PendingForm[]> {
  const sessions = await prisma.programSession.findMany({
    where: {
      assignment: { patientId, isActive: true },
      // Filtro barato: contiene la palabra FORM en el snapshot. Evita cargar
      // sesiones sin ningún formulario. La comprobación fina se hace al
      // parsear el JSON.
      tasksSnapshot: { contains: '"FORM"' },
    },
    select: {
      id: true,
      scheduledDate: true,
      tasksSnapshot: true,
      responses: true,
      assignment: { select: { program: { select: { name: true } } } },
    },
    orderBy: { scheduledDate: "asc" },
  });

  const out: PendingForm[] = [];
  for (const s of sessions) {
    let tasks: any[] = [];
    let responses: Record<string, any> = {};
    try { tasks = JSON.parse(s.tasksSnapshot) as any[]; } catch { continue; }
    if (s.responses) {
      try { responses = JSON.parse(s.responses) as Record<string, any>; } catch { responses = {}; }
    }
    for (const t of tasks) {
      if (t?.type !== "FORM") continue;
      const r = responses[t.id];
      const empty = r === undefined || r === null || (typeof r === "object" && Object.keys(r).length === 0);
      if (empty) {
        out.push({
          sessionId: s.id,
          scheduledDate: s.scheduledDate.toISOString(),
          formTitle: String(t.title || "Formulario"),
          programName: s.assignment?.program?.name || "",
        });
        break; // basta con 1 FORM pendiente por sesión para listarla
      }
    }
  }
  return out;
}
