/**
 * Helpers para calcular fechas SIEMPRE en la zona horaria del paciente.
 * Antes teníamos todo hardcoded a Europe/Madrid — funcionaba mientras
 * todos los pacientes vivían en España. Ahora pueden estar en cualquier
 * país (Colombia, México, etc), así que "hoy" para el paciente A no es
 * lo mismo que "hoy" para el paciente B.
 *
 * Todos los cálculos devuelven Date en UTC midnight de la fecha calendario
 * en la TZ del paciente — así se pueden usar como claves estables (p. ej.
 * PatientDailyLog.recordedDate) sin depender del server o cliente.
 */

export const DEFAULT_TZ = "Europe/Madrid";

function resolveTz(tz: string | null | undefined): string {
  return tz && tz.trim() ? tz : DEFAULT_TZ;
}

/** Fecha calendario "hoy" del paciente como UTC midnight. */
export function todayForPatient(tz: string | null | undefined, now: Date = new Date()): Date {
  return startOfDayForPatient(tz, now);
}

/** Fecha calendario del paciente como UTC midnight (para una fecha dada). */
export function startOfDayForPatient(tz: string | null | undefined, date: Date): Date {
  const timeZone = resolveTz(tz);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value) - 1;
  const d = Number(parts.find((p) => p.type === "day")!.value);
  return new Date(Date.UTC(y, m, d));
}

/** Día de la semana (1..7, lunes=1) en la TZ del paciente. */
export function dowForPatient(tz: string | null | undefined, date: Date = new Date()): number {
  const day = startOfDayForPatient(tz, date);
  const dow = day.getUTCDay(); // 0=Dom,1=Lun,...,6=Sab
  return dow === 0 ? 7 : dow;
}

/** Lunes UTC midnight de la semana calendario del paciente que contiene `date`. */
export function weekStartForPatient(tz: string | null | undefined, date: Date = new Date()): Date {
  const day = startOfDayForPatient(tz, date);
  const dow = day.getUTCDay(); // 0=Dom
  const offset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(day);
  monday.setUTCDate(day.getUTCDate() + offset);
  return monday;
}
