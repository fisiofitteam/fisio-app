/**
 * Métricas del setter IA (Skalex) para el cuadro de mandos.
 *
 * Fuente: espejo local en SkalexConversation + SkalexLabel. Sincronizado
 * cada 30 min por el cron /api/cron/skalex-sync.
 */
import { prisma } from "@/lib/prisma";

export type SkalexMonthlyMetrics = {
  /** Conversaciones con lastMessageAt en el rango (actividad total). */
  activeConversations: number;
  /** Conteo de labels por nombre, addedAt en el rango. */
  labelsByName: { name: string; color: string | null; count: number }[];
  /** Distribución por fase IA (última fase conocida). */
  aiPhaseCounts: { phase: number | null; phaseName: string | null; count: number }[];
  /** Cuántas conversaciones han terminado ligándose a un Patient del CRM. */
  linkedToPatient: number;
  /** Cuántas se han ligado a Lead pero aún no a Patient. */
  linkedToLeadOnly: number;
  /** Sin cruce con CRM (contacto Skalex sin correspondencia en Lead/Patient). */
  unlinked: number;
  /** Última vez que corrió el sync. Sirve para pintar "hace X min" en la UI. */
  lastSyncAt: Date | null;
  lastError: string | null;
};

export async function getSkalexMonthlyMetrics(from: Date, to: Date): Promise<SkalexMonthlyMetrics> {
  const rangeFilter = { lastMessageAt: { gte: from, lte: to } };
  const [state, activeConversations, labels, phases, linkedToPatient, linkedAny] = await Promise.all([
    prisma.skalexSyncState.findUnique({ where: { id: "singleton" } }),
    prisma.skalexConversation.count({ where: rangeFilter }),
    prisma.skalexLabel.groupBy({
      by: ["name", "color"],
      where: { addedAt: { gte: from, lte: to } },
      _count: { _all: true },
      orderBy: { _count: { name: "desc" } },
    }),
    prisma.skalexConversation.groupBy({
      by: ["aiPhase", "aiPhaseName"],
      where: rangeFilter,
      _count: { _all: true },
      orderBy: { aiPhase: "asc" },
    }),
    prisma.skalexConversation.count({
      where: { ...rangeFilter, patientId: { not: null } },
    }),
    prisma.skalexConversation.count({
      where: { ...rangeFilter, OR: [{ patientId: { not: null } }, { leadId: { not: null } }] },
    }),
  ]);

  const total = activeConversations;
  const linkedToLeadOnly = Math.max(0, linkedAny - linkedToPatient);
  const unlinked = Math.max(0, total - linkedAny);

  return {
    activeConversations,
    labelsByName: labels.map((l) => ({
      name: l.name,
      color: l.color,
      count: l._count._all,
    })),
    aiPhaseCounts: phases.map((p) => ({
      phase: p.aiPhase,
      phaseName: p.aiPhaseName,
      count: p._count._all,
    })),
    linkedToPatient,
    linkedToLeadOnly,
    unlinked,
    lastSyncAt: state?.lastSuccessAt ?? null,
    lastError: state?.lastError ?? null,
  };
}
