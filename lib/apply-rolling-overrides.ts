/**
 * Aplica los overrides de rolling de un paciente sobre una lista de
 * RollingTasks del programa maestro. Devuelve las tareas ya "personalizadas":
 *   - Si el override.hidden = true → se filtra (no aparece al atleta).
 *   - Si el override tiene title/bodyText/videoId no null → sobreescribe.
 * Los overrides que no aplican a ninguna tarea se ignoran.
 */
import { prisma } from "@/lib/prisma";

type MinimalTask = {
  id: string;
  type: string;
  title: string;
  bodyText: string | null;
  videoId: string | null;
  order?: number;
  [key: string]: any;
};

export async function fetchOverridesForPatient(patientId: string) {
  return await (prisma as any).patientRollingTaskOverride
    .findMany({ where: { patientId } })
    .catch(() => [] as Array<any>);
}

export function applyRollingOverridesToTasks<T extends MinimalTask>(
  tasks: T[],
  overrides: Array<{ taskId: string; hidden: boolean; title: string | null; bodyText: string | null; videoId: string | null }>,
): T[] {
  if (!overrides.length) return tasks;
  const byTaskId = new Map(overrides.map((o) => [o.taskId, o]));

  return tasks.flatMap((t) => {
    const o = byTaskId.get(t.id);
    if (!o) return [t];
    if (o.hidden) return [] as T[];
    return [{
      ...t,
      title: o.title ?? t.title,
      bodyText: o.bodyText ?? t.bodyText,
      videoId: o.videoId ?? t.videoId,
    }];
  });
}
