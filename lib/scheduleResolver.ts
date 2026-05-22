import { prisma } from "@/lib/prisma";

/**
 * Resuelve qué closer cubre una fecha/hora concreta según las franjas de
 * `ClosingShift` configuradas para esa semana.
 *
 * Uso típico: cuando un lead agenda en el Calendar el "Lunes 26 may a las
 * 11:00", llamamos a `whoseSlot(date)` y nos dice qué closerId atiende.
 * Si no hay franja que cubra esa hora, devuelve null (sin asignar).
 *
 * Detalles:
 *  - Las franjas son inclusivas en startTime y EXCLUSIVAS en endTime
 *    (una franja 09:00-14:00 cubre desde las 09:00 hasta las 13:59:59)
 *  - Si dos franjas se solapan (caso edge no debería ocurrir si validamos
 *    al crear), se usa la primera encontrada
 *  - dayOfWeek: 1=L, 2=M, 3=X, 4=J, 5=V, 6=S, 7=D
 */

/** Devuelve el lunes 00:00 de la semana que contiene la fecha dada */
export function weekStartOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay() === 0 ? 7 : d.getDay(); // 1-7
  d.setDate(d.getDate() - (dow - 1));
  return d;
}

/** Convierte "HH:MM" a minutos desde medianoche (09:30 → 570) */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

export async function whoseSlot(datetime: Date): Promise<string | null> {
  const weekStart = weekStartOf(datetime);
  const dow = datetime.getDay() === 0 ? 7 : datetime.getDay();
  const minutes = datetime.getHours() * 60 + datetime.getMinutes();

  const shifts = await prisma.closingShift.findMany({
    where: {
      weekStartDate: weekStart,
      dayOfWeek: dow,
    },
  });

  for (const shift of shifts) {
    const startMin = timeToMinutes(shift.startTime);
    const endMin = timeToMinutes(shift.endTime);
    if (minutes >= startMin && minutes < endMin) {
      return shift.closerId;
    }
  }
  return null;
}
