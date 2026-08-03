/**
 * Filtro Prisma "el paciente sigue activo", pensado para spread dentro de
 * cualquier `where.patient = { ... }` de un modelo relacionado.
 *
 * Definimos "activo" con el mismo criterio que la pestaña "🏁 Terminados"
 * de /fisio/pacientes: tiene al menos un SubscriptionRenewal con
 * `status = "active"` y `endDate` en el futuro. En cuanto pasa esa fecha
 * (y no hay renovación posterior) el paciente cuenta como terminado y
 * ya no debe recibir avisos automáticos (control de cargas, alertas de
 * sesión, formularios pendientes, "programa a punto de terminar", etc).
 *
 * IMPORTANTE: los pacientes PAUSADOS también cuentan como activos con
 * este criterio (durante una pausa el endDate se extiende para congelar
 * el ciclo). Si necesitas activo-y-no-pausado — por ejemplo para la
 * factura mensual, donde no se factura al paciente durante su pausa —
 * combínalo con `NOT: currentlyPausedCondition()`.
 *
 * Se materializa como función porque `new Date()` debe reevaluarse en
 * cada llamada — usarlo como constante congelaría el momento en el que
 * se importa el módulo.
 */
export function activePatientCondition() {
  return {
    renewals: {
      some: {
        status: "active",
        endDate: { gt: new Date() },
      },
    },
  };
}

/**
 * Filtro Prisma "el paciente está HOY dentro de una ProgramPause". Igual
 * criterio que `lib/subscription-progress.ts`: `startDate <= now` y
 * `now < (actualEndDate ?? endDate)`. Se ignoran las pausas ended/cancelled.
 *
 * Se usa habitualmente negado (`NOT: currentlyPausedCondition()`) para
 * excluir a los pausados de la factura mensual del fisio.
 */
export function currentlyPausedCondition() {
  const now = new Date();
  return {
    programPauses: {
      some: {
        status: { in: ["scheduled", "active"] },
        startDate: { lte: now },
        OR: [
          { actualEndDate: null, endDate: { gt: now } },
          { actualEndDate: { gt: now } },
        ],
      },
    },
  };
}
