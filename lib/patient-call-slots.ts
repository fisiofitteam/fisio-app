/**
 * Cálculo de slots libres para reservar una llamada con un fisio concreto.
 *
 * Input:
 *   - plantilla semanal del fisio (ProfessionalCallAvailability)
 *   - ventana [from, to)
 *   - duración deseada de la sesión
 *   - tramos ocupados según Google FreeBusy
 *
 * Output: array de Date de inicio de cada slot libre (todos con la misma
 * duración). Todas las horas se manejan en Europe/Madrid.
 */

const DEFAULT_TZ = "Europe/Madrid";

export type AvailabilityRow = { dayOfWeek: number; startTime: string; endTime: string };
/** Franja puntual para una fecha concreta (YYYY-MM-DD en zona Madrid). */
export type OneOffRow = { dateKey: string; startTime: string; endTime: string };
export type Busy = { start: Date; end: Date };

/**
 * Devuelve la fecha UTC que corresponde a una hora Madrid dada.
 * Uso: buildMadridDate("2026-08-19", "09:30") → Date UTC de las 07:30 UTC
 * (o 08:30 en invierno cuando España es +01).
 *
 * Estrategia: Intl.DateTimeFormat.formatToParts nos da los componentes que
 * Madrid ve, así hallamos el offset del día y ajustamos.
 */
export function buildMadridDate(dateStr: string, hhmm: string): Date {
  // dateStr = "YYYY-MM-DD", hhmm = "HH:mm"
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  // Construimos como si fuera UTC y luego restamos el offset de Madrid en
  // ese momento.
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  // Cuánto se aparta Madrid de UTC ese instante (min):
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const madridStr = fmt.format(new Date(asUtc));
  const [mh, mm2] = madridStr.split(":").map(Number);
  // Diferencia entre la hora deseada y la que "vio" Madrid a partir del
  // pseudo-UTC. Si son iguales estamos ok, si no ajustamos.
  const diffMin = ((hh - mh) * 60 + (mm - mm2));
  return new Date(asUtc + diffMin * 60_000);
}

/** Suma minutos a una fecha, devuelve un nuevo Date. */
function addMin(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60_000);
}

/** Devuelve YYYY-MM-DD para la zona Madrid de un Date. */
function madridDateKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: DEFAULT_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  return parts;
}

/** dayOfWeek 1-7 (1=Lun,7=Dom) del Date en zona Madrid. */
function madridDow(d: Date): number {
  // getDay en horario Madrid: usamos toLocaleString como truco
  const s = new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TZ, weekday: "short" }).format(d);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[s] ?? 1;
}

/**
 * Calcula slots libres en la ventana [from, to). Cada slot dura `durationMin`.
 * Se generan cada `stepMin` (por defecto igual a la duración, sin solapes).
 */
export function computeFreeSlots(input: {
  availability: AvailabilityRow[];
  /** Franjas puntuales que se SUMAN a la plantilla del día. Opcional. */
  oneOffs?: OneOffRow[];
  busy: Busy[];
  from: Date;
  to: Date;
  durationMin: number;
  stepMin?: number;
  minLeadMin?: number;  // No ofrecer slots que empiecen en menos de N min desde now
}): Date[] {
  const step = input.stepMin ?? input.durationMin;
  const leadMin = input.minLeadMin ?? 60;
  const nowLimit = new Date(Date.now() + leadMin * 60_000);

  // Recogemos las ventanas de la plantilla para cada día concreto dentro
  // de [from, to). Añadimos también las franjas one-off del día (misma
  // semántica: rango abierto para llamadas).
  const slots: Date[] = [];
  const startDay = new Date(input.from);
  startDay.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(input.to);
  endDay.setUTCHours(0, 0, 0, 0);

  for (let day = new Date(startDay); day <= endDay; day = new Date(day.getTime() + 24 * 3600 * 1000)) {
    const dateKey = madridDateKey(day);
    const dow = madridDow(day);
    const dayWindows: Array<{ startTime: string; endTime: string }> = [
      ...input.availability.filter((r) => r.dayOfWeek === dow),
      ...(input.oneOffs?.filter((r) => r.dateKey === dateKey) ?? []),
    ];
    for (const row of dayWindows) {
      const windowStart = buildMadridDate(dateKey, row.startTime);
      const windowEnd = buildMadridDate(dateKey, row.endTime);
      let cursor = new Date(windowStart);
      while (cursor.getTime() + input.durationMin * 60_000 <= windowEnd.getTime()) {
        const slotEnd = addMin(cursor, input.durationMin);
        if (cursor >= input.from && slotEnd <= input.to && cursor >= nowLimit) {
          // Comprobar contra busy: si algún busy solapa con [cursor, slotEnd), descartamos.
          const overlaps = input.busy.some((b) => b.start < slotEnd && b.end > cursor);
          if (!overlaps) slots.push(new Date(cursor));
        }
        cursor = addMin(cursor, step);
      }
    }
  }

  // Deduplicar por si la plantilla tiene solapes (raro pero seguro)
  const seen = new Set<number>();
  return slots.filter((s) => {
    const t = s.getTime();
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  }).sort((a, b) => a.getTime() - b.getTime());
}
