/** Calendar-month navigation shared by the KPI views. No stored data is changed. */
export function currentKpiMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

export function resolveKpiMonth(value?: string, now = new Date()) {
  const valid = value && /^(20\d{2})-(0[1-9]|1[0-2])$/.test(value);
  const month = valid ? value! : currentKpiMonth(now);
  const [year, number] = month.split("-").map(Number);
  // Existing yearly metrics bucket records in UTC; use the same boundaries.
  const start = new Date(Date.UTC(year, number - 1, 1));
  const end = new Date(Date.UTC(year, number, 1) - 1);
  const label = start.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  return { month, year, start, end, label };
}

export function resolveKpiYear(value: string | undefined, fallback: number): number {
  return value && /^20\d{2}$/.test(value) ? Number(value) : fallback;
}
