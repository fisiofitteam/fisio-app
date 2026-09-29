/**
 * Helpers para el reporte mensual del equipo (traído del antiguo
 * Google Forms). Un registro por profesional y mes.
 */
export const REPORT_FIELDS = [
  { key: "goodThings",        label: "¿Qué ha ido bien este mes?",                                              required: true,  type: "long"  as const },
  { key: "badThings",         label: "¿Qué ha ido mal este mes?",                                               required: false, type: "long"  as const },
  { key: "needHelp",          label: "¿Necesitas ayuda con algún aspecto de tu trabajo en el equipo?",         required: false, type: "long"  as const },
  { key: "personalMood",      label: "A nivel personal, ¿qué tal estás? ¿Puedo hacer algo por ti?",            required: false, type: "long"  as const },
  { key: "patientHelp",       label: "¿Hay algún paciente con el que necesites algún tipo de ayuda?",          required: true,  type: "long"  as const },
  { key: "callToReview",      label: "¿Hay alguna llamada de renovación o de seguimiento que quieras que te revise?", required: false, type: "long"  as const },
  { key: "callLink",          label: "Si has contestado afirmativamente, pega aquí el enlace de la llamada",  required: false, type: "short" as const },
  { key: "nonRenewalReasons", label: "Las personas que no han renovado, ¿por qué motivo principal ha sido?",  required: true,  type: "long"  as const },
  { key: "successCases",      label: "¿Qué casos de éxito destacarías este mes de tus pacientes?",             required: true,  type: "long"  as const },
  { key: "programIdeas",      label: "¿Hay alguna mejora a nivel de programa que hayas pensado durante estas semanas?", required: false, type: "long"  as const },
] as const;

export type ReportFieldKey = typeof REPORT_FIELDS[number]["key"];

/** "YYYY-MM" del mes indicado en TZ Madrid. */
export function monthKey(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? String(date.getUTCFullYear());
  const m = parts.find((p) => p.type === "month")?.value ?? String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** "Septiembre 2026" — label humano del mes. */
export function monthLabel(mk: string): string {
  const [y, m] = mk.split("-").map(Number);
  if (!y || !m) return mk;
  const d = new Date(Date.UTC(y, m - 1, 1));
  const s = d.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Roles del equipo a los que se les pide el reporte mensual.
 *  Deliberadamente sin "ceo": Ales no se reporta a sí mismo — LEE
 *  los reportes en el bloque de métricas de equipo del panel. */
export const REPORTING_ROLES = ["head_success", "fisio"] as const;

export function shouldSubmitReport(role: string): boolean {
  return (REPORTING_ROLES as readonly string[]).includes(role);
}

/** Puede ver todos los reportes de un mes: solo CEO y head_success. */
export function canReadTeamReports(role: string): boolean {
  return role === "ceo" || role === "head_success";
}
