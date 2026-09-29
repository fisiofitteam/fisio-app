/**
 * Helpers para el reporte mensual del equipo (traído del antiguo
 * Google Forms). Un registro por profesional y mes.
 */
/**
 * Escalas 0-10 en cabecera del formulario. Semántica: 10 siempre es mejor
 * (agregación consistente en el dashboard). Todas son obligatorias — sin
 * ellas no hay señal cuantitativa mes a mes.
 */
export const SCALE_FIELDS = [
  { key: "scaleSatisfaction",   label: "Satisfacción global con tu trabajo este mes",         low: "Fatal",     high: "Genial",   group: "wellbeing" as const },
  { key: "scaleWorkload",       label: "Cómo te sientes con la carga de trabajo",             low: "Ahogado",   high: "Cómodo",   group: "wellbeing" as const },
  { key: "scaleTaskWhatsapp",   label: "Feedback y mensajes por WhatsApp",                    low: "Muy mal",   high: "Muy bien", group: "task"      as const },
  { key: "scaleTaskAssessment", label: "Valoraciones iniciales",                              low: "Muy mal",   high: "Muy bien", group: "task"      as const },
  { key: "scaleTaskOptCall",    label: "Videollamadas de optimización",                       low: "Muy mal",   high: "Muy bien", group: "task"      as const },
  { key: "scaleTaskRenewCall",  label: "Videollamadas de renovación",                         low: "Muy mal",   high: "Muy bien", group: "task"      as const },
  { key: "scaleTaskMeetings",   label: "Reuniones internas",                                  low: "Muy mal",   high: "Muy bien", group: "task"      as const },
  { key: "scaleTaskAppMgmt",    label: "Gestión de programas y clientes en la app",           low: "Muy mal",   high: "Muy bien", group: "task"      as const },
] as const;
export type ScaleFieldKey = typeof SCALE_FIELDS[number]["key"];

/** Preguntas de texto libre (el formulario original del Google Forms). */
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

/**
 * Fecha del primer lunes del mes indicado (en TZ Madrid). Ejemplo:
 * si el mes empieza en domingo, devuelve el día 2 (lunes). Si empieza
 * en martes, devuelve el día 7 (siguiente lunes). Siempre en la
 * misma TZ que usamos para el resto.
 */
export function firstMondayOfMonth(year: number, month1to12: number): Date {
  // Hallamos el weekday del día 1 en TZ Madrid.
  const day1 = new Date(Date.UTC(year, month1to12 - 1, 1, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
  }).format(day1);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const dow = map[weekday] || 1;
  // Días a sumar al 1 para llegar al lunes: (1 - dow + 7) % 7
  const daysToAdd = ((1 - dow) + 7) % 7;
  return new Date(Date.UTC(year, month1to12 - 1, 1 + daysToAdd, 0, 0, 0));
}

/**
 * ¿Estamos en o después del primer lunes del mes actual? Es la ventana
 * en la que se muestra el banner. Antes del primer lunes, silencio;
 * a partir del primer lunes hasta que rellenen (o fin de mes).
 */
export function isReportingWindowOpen(now: Date = new Date()): boolean {
  // Extraemos año/mes del "ahora" en TZ Madrid.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  if (!y || !m) return false;
  const firstMon = firstMondayOfMonth(y, m);
  return now.getTime() >= firstMon.getTime();
}
