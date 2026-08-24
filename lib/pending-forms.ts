/**
 * Detecta si un paciente tiene tareas de tipo FORM sin rellenar en alguna
 * de sus sesiones. Se usa para pintar un banner persuasivo en el home
 * pidiéndole que las complete.
 *
 * Criterio: existe una tarea FORM SIN respuesta en una sesión cuya fecha
 * programada ya ha llegado (hoy o pasado). Los formularios de sesiones
 * futuras NO cuentan aún — no queremos molestar al paciente con avisos
 * de algo que aún no le toca. Una vez llega el día, el banner persiste
 * hasta que rellene el formulario, incluso si la sesión pasa sin marcarse
 * como completada.
 */
import { prisma } from "@/lib/prisma";

export type PendingForm = {
  sessionId: string;
  scheduledDate: string; // ISO
  formTitle: string;     // título del FORM (o de la sesión si no)
  programName: string;
};

export async function getPendingFormsForPatient(patientId: string): Promise<PendingForm[]> {
  // "Hoy" en el timezone del servidor. El schedule del paciente usa el mismo
  // criterio (00:00 del día programado en UTC), así que basta con comparar
  // contra el fin del día actual — la sesión "de hoy" aparece desde las 00:00.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const sessions = await prisma.programSession.findMany({
    where: {
      assignment: { patientId, isActive: true },
      // Solo sesiones cuya fecha ya ha llegado (hoy o pasado). Las futuras
      // no molestan al paciente.
      scheduledDate: { lte: endOfToday },
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
