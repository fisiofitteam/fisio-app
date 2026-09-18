/**
 * Devuelve la etiqueta del trimestre actual en formato "YYYY-Qn" en TZ
 * Madrid (todo el negocio opera con esa zona). Ej: "2026-Q3" para
 * julio-septiembre 2026.
 */
export function currentQuarterLabel(now: Date = new Date()): string {
  const madridMonth = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", month: "numeric" }).format(now),
  );
  const madridYear = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric" }).format(now),
  );
  const quarter = Math.floor((madridMonth - 1) / 3) + 1;
  return `${madridYear}-Q${quarter}`;
}

/**
 * Etiqueta legible del trimestre: "3er trimestre 2026 · jul-sep".
 */
export function quarterHumanLabel(quarter: string): string {
  const m = quarter.match(/^(\d{4})-Q([1-4])$/);
  if (!m) return quarter;
  const year = m[1];
  const q = Number(m[2]);
  const monthsByQ: Record<number, string> = {
    1: "ene-mar",
    2: "abr-jun",
    3: "jul-sep",
    4: "oct-dic",
  };
  const ord = ["", "1er", "2º", "3er", "4º"][q];
  return `${ord} trimestre ${year} · ${monthsByQ[q]}`;
}
