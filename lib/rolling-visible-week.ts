/**
 * Resuelve qué RollingWeek debe ver un paciente ADVANCE / PREVENTION en
 * la app hoy. Regla:
 *   1. Si la semana correspondiente al lunes actual EXISTE y está publicada
 *      → esa.
 *   2. Si no, buscar la próxima RollingWeek PUBLICADA con weekStartDate > hoy
 *      → esa. Así el atleta ve el "avance" del CEO cuando ha programado con
 *      antelación y aún no toca hoy.
 *   3. Si tampoco hay futura publicada → null (mostrar "aún no disponible").
 *
 * Los includes se parametrizan porque cada consumidor (home, semana-completa,
 * sesion-hoy) trae distintos anidados (tareas con ejercicios, o solo tareas).
 */
import { prisma } from "@/lib/prisma";

export async function resolveVisibleRollingWeek<T = any>(
  programId: string | null,
  thisMonday: Date,
  include: any,
): Promise<T | null> {
  if (!programId) return null;

  const current = await prisma.rollingWeek.findUnique({
    where: { programId_weekStartDate: { programId, weekStartDate: thisMonday } },
    include,
  }) as any;
  if (current?.publishedAt) return current as T;

  const next = await prisma.rollingWeek.findFirst({
    where: {
      programId,
      publishedAt: { not: null },
      weekStartDate: { gt: thisMonday },
    },
    orderBy: { weekStartDate: "asc" },
    include,
  }) as any;
  return (next ?? null) as T | null;
}
