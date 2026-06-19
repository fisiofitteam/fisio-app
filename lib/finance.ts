import { prisma } from "./prisma";

export type Period = "day" | "week" | "month" | "quarter" | "year";

/**
 * Rango de un mes concreto en formato "YYYY-MM" (p. ej. "2025-03").
 * Útil para el cuadro de mandos cuando el usuario elige un mes histórico.
 * Devuelve null si el formato es inválido.
 */
export function parseSpecificMonth(value: string | undefined | null): { start: Date; end: Date; label: string } | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  const start = new Date(year, month, 1, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  const label = start.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return { start, end, label };
}

export function getPeriodRange(period: Period): { start: Date; end: Date; label: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === "day") {
    // "Día" = AYER completo (00:00–23:59). Usamos ayer porque hoy aún no
    // ha terminado y Meta puede devolver datos incompletos.
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    const label = start.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    return { start, end, label };
  }

  if (period === "week") {
    // "Semana" = últimos 7 días terminados ayer (no incluye hoy).
    const end = new Date(now);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: "últimos 7 días" };
  }

  if (period === "month") {
    const start = new Date(year, month, 1, 0, 0, 0);
    const end = new Date(year, month + 1, 0, 23, 59, 59);
    const label = start.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    return { start, end, label };
  }

  if (period === "quarter") {
    const q = Math.floor(month / 3);
    const start = new Date(year, q * 3, 1, 0, 0, 0);
    const end = new Date(year, q * 3 + 3, 0, 23, 59, 59);
    const label = `Q${q + 1} ${year}`;
    return { start, end, label };
  }

  // year
  const start = new Date(year, 0, 1, 0, 0, 0);
  const end = new Date(year, 11, 31, 23, 59, 59);
  const label = String(year);
  return { start, end, label };
}

/**
 * Devuelve el periodo INMEDIATAMENTE anterior al actual, de la misma duración.
 * Útil para comparar tendencia (ej.: ayer vs anteayer; esta semana vs la pasada).
 */
export function getPreviousPeriodRange(period: Period): { start: Date; end: Date; label: string } {
  const current = getPeriodRange(period);
  const durationMs = current.end.getTime() - current.start.getTime();

  if (period === "day") {
    const start = new Date(current.start);
    start.setDate(start.getDate() - 1);
    const end = new Date(current.end);
    end.setDate(end.getDate() - 1);
    return { start, end, label: start.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) };
  }
  if (period === "week") {
    const end = new Date(current.start);
    end.setMilliseconds(-1);
    const start = new Date(end.getTime() - durationMs);
    return { start, end, label: "7 días anteriores" };
  }
  if (period === "month") {
    const start = new Date(current.start);
    start.setMonth(start.getMonth() - 1);
    const end = new Date(current.start);
    end.setMilliseconds(-1);
    return { start, end, label: start.toLocaleDateString("es-ES", { month: "long", year: "numeric" }) };
  }
  if (period === "quarter") {
    const start = new Date(current.start);
    start.setMonth(start.getMonth() - 3);
    const end = new Date(current.start);
    end.setMilliseconds(-1);
    const q = Math.floor(start.getMonth() / 3);
    return { start, end, label: `Q${q + 1} ${start.getFullYear()}` };
  }
  // year
  const start = new Date(current.start);
  start.setFullYear(start.getFullYear() - 1);
  const end = new Date(current.start);
  end.setMilliseconds(-1);
  return { start, end, label: String(start.getFullYear()) };
}

export type FinanceSummary = {
  income: number;
  expense: number;
  profit: number;
  profitPct: number | null;
  incomeNew: number;
  incomeRenewal: number;
  incomeOther: number;
  countNew: number;
  countRenewal: number;
  countOther: number;
};

// Las renovaciones con outcome=renewed y amountPaid cuentan como ingresos por renovación
// aunque no estén en la tabla Transaction (mantenemos compatibilidad)
export async function calculateFinanceSummary(start: Date, end: Date): Promise<FinanceSummary> {
  const transactions = await prisma.transaction.findMany({
    where: { occurredAt: { gte: start, lte: end } },
  });

  // Renovaciones automáticas (las que no se han duplicado como transaction manual)
  const renewals = await prisma.subscriptionRenewal.findMany({
    where: {
      decidedAt: { gte: start, lte: end },
      outcome: "renewed",
      amountPaid: { not: null },
    },
  });

  let incomeNew = 0;
  let incomeRenewal = 0;
  let incomeOther = 0;
  let expense = 0;
  let countNew = 0;
  let countRenewal = 0;
  let countOther = 0;

  for (const t of transactions) {
    if (t.type === "income_new") { incomeNew += t.amount; countNew++; }
    else if (t.type === "income_renewal") { incomeRenewal += t.amount; countRenewal++; }
    else if (t.type === "income_other") { incomeOther += t.amount; countOther++; }
    else if (t.type === "expense") { expense += t.amount; }
  }

  // Sumar renovaciones automáticas (de SubscriptionRenewal)
  for (const r of renewals) {
    incomeRenewal += r.amountPaid ?? 0;
    countRenewal++;
  }

  const income = incomeNew + incomeRenewal + incomeOther;
  const profit = income - expense;
  const profitPct = income > 0 ? Math.round((profit / income) * 100) : null;

  return { income, expense, profit, profitPct, incomeNew, incomeRenewal, incomeOther, countNew, countRenewal, countOther };
}
