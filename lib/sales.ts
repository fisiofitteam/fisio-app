import { prisma } from "./prisma";

export type SalesMetrics = {
  scheduled: number;       // total que se programaron en el período (vivos o muertos)
  totalCalls: number;      // llamadas realizadas (won + lost + no_show)
  won: number;
  lost: number;
  cancelled: number;
  no_show: number;
  closeRate: number | null;  // won / (won + lost) en %
  showUpRate: number | null; // (won + lost) / (won + lost + no_show) en %
  // Extendido
  wonByProgram: { RECUPERA: number; CONSOLIDA: number; ADVANCE: number; NONE: number };
  revenue: number;          // facturación total del período (suma importes)
  ticketAvg: number | null; // ticket medio
};

// Métricas del período:
//   - `scheduled`: llamadas cuya FECHA DE CITA (callScheduledAt) cae en el rango.
//     Refleja la actividad del calendario del closer en ese período.
//   - `won/lost/cancelled/no_show`: leads DECIDIDOS en el rango (decidedAt).
//     Esto permite que un lead agendado para un mes y cerrado en otro (p.ej. tras
//     follow-up) impacte en el período de cierre, no en el de la llamada original.
//   - `revenue`: suma de transacciones income_new asociadas a los leads decididos
//     como "won" en el período.
export async function calculateSalesMetrics(
  start: Date,
  end: Date,
  closerId?: string
): Promise<SalesMetrics> {
  const baseWhere = closerId ? { closerId } : {};

  // ── A) Llamadas que TENÍAN cita en el período (cualquier estado) ─────────
  const scheduled = await prisma.lead.count({
    where: { ...baseWhere, callScheduledAt: { gte: start, lte: end } },
  });

  // ── B) Leads decididos (cerrados) en el período ───────────────────────────
  const decided = await prisma.lead.findMany({
    where: {
      ...baseWhere,
      decidedAt: { gte: start, lte: end },
      status: { in: ["won", "lost", "cancelled", "no_show"] },
    },
    include: {
      convertedPatient: { select: { id: true, programType: true } },
    },
  });

  let won = 0, lost = 0, cancelled = 0, no_show = 0;
  const wonByProgram = { RECUPERA: 0, CONSOLIDA: 0, ADVANCE: 0, NONE: 0 };
  const convertedPatientIds: string[] = [];

  for (const l of decided) {
    if (l.status === "won") {
      won++;
      const prog = l.convertedPatient?.programType ?? "NONE";
      if (prog === "RECUPERA" || prog === "CONSOLIDA" || prog === "ADVANCE") {
        wonByProgram[prog]++;
      } else {
        wonByProgram.NONE++;
      }
      if (l.convertedPatient) convertedPatientIds.push(l.convertedPatient.id);
    }
    else if (l.status === "lost") lost++;
    else if (l.status === "cancelled") cancelled++;
    else if (l.status === "no_show") no_show++;
  }

  const totalCalls = won + lost + no_show;
  const closeRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;
  const showUpRate = totalCalls > 0 ? Math.round(((won + lost) / totalCalls) * 100) : null;

  // Facturación: sumar income_new de los pacientes convertidos en el período.
  let revenue = 0;
  if (convertedPatientIds.length > 0) {
    const transactions = await prisma.transaction.findMany({
      where: {
        type: "income_new",
        patientId: { in: convertedPatientIds },
      },
    });
    revenue = transactions.reduce((acc, t) => acc + t.amount, 0);
  }
  const ticketAvg = won > 0 ? Math.round(revenue / won) : null;

  return {
    scheduled, totalCalls, won, lost, cancelled, no_show,
    closeRate, showUpRate,
    wonByProgram, revenue, ticketAvg,
  };
}

export type CloserBreakdown = {
  id: string;
  fullName: string;
  role: string;
} & SalesMetrics;

export async function calculateSalesByCloser(start: Date, end: Date): Promise<CloserBreakdown[]> {
  const closers = await prisma.professional.findMany({
    where: { role: { in: ["ceo", "closer"] } },
    orderBy: { fullName: "asc" },
  });

  return Promise.all(
    closers.map(async (c) => {
      const m = await calculateSalesMetrics(start, end, c.id);
      return { id: c.id, fullName: c.fullName, role: c.role, ...m };
    })
  );
}
