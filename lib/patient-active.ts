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
