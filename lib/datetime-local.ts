// Helpers para trabajar con <input type="datetime-local"> de forma que
// SIEMPRE se interprete como "hora del reloj de pared del usuario" (no UTC).
//
// El bug clásico:
//   new Date("2026-07-06T11:00").toISOString()
// depende del motor: Chrome moderno lo trata como hora local, pero Safari
// (y algunos motores antiguos) lo tratan como UTC. Al guardarse mal, el
// display luego suma la diferencia horaria y ves +2h en verano español.
//
// Estos helpers construyen la fecha campo a campo, así que el resultado es
// idéntico en cualquier navegador y motor.

/**
 * Convierte "YYYY-MM-DDTHH:mm" (valor tal cual de un input datetime-local)
 * a un ISO UTC correcto, interpretándolo como hora local del usuario.
 */
export function datetimeLocalInputToUtcIso(local: string): string {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) {
    // Fallback tolerante: si el string ya viene con Z o zona, deja que
    // Date lo parsee. Para strings raros (vacíos) devolvemos "".
    if (!local) return "";
    const d = new Date(local);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }
  const [, y, mo, d, hh, mm, ss = "0"] = m;
  const dt = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss),
  );
  return dt.toISOString();
}

/**
 * Convierte un ISO UTC (ej. "2026-07-06T09:00:00.000Z") a "YYYY-MM-DDTHH:mm"
 * expresado en hora local del usuario. Listo para meter en el `value` de un
 * <input type="datetime-local">.
 */
export function utcIsoToDatetimeLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Devuelve un valor inicial para el input datetime-local: "ahora + horas"
 * redondeado a la hora en punto, en hora local del usuario.
 */
export function nowPlusHoursForInput(hoursAhead = 1): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + hoursAhead);
  return utcIsoToDatetimeLocalInput(d.toISOString());
}
