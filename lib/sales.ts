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

// `scheduled`: TODAS las llamadas cuyo callScheduledAt cae en el rango.
// (independientemente del status final)
export async function calculateSalesMetrics(
  start: Date,
  end: Date,
  closerId?: string
): Promise<SalesMetrics> {
  const baseWhere = closerId ? { closerId } : {};

  const leads = await prisma.lead.findMany({
    where: {
      ...baseWhere,
      callScheduledAt: { gte: start, lte: end },
    },
    include: {
      convertedPatient: { select: { id: true, programType: true } },
    },
  });

  let scheduled = 0, won = 0, lost = 0, cancelled = 0, no_show = 0;
  const wonByProgram = { RECUPERA: 0, CONSOLIDA: 0, ADVANCE: 0, NONE: 0 };

  // IDs de pacientes convertidos para luego sumar facturación
  const convertedPatientIds: string[] = [];

  for (const l of leads) {
    // "scheduled" cuenta TODAS las llamadas del período (cambio de petición del CEO)
    scheduled++;
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

  // Facturación: sumar transacciones income_new de los pacientes convertidos
  // (registradas al hacer la conversión, así sabemos exactamente cuánto cobró cada closer)
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
