// Helper para el recuadro "Controles de cargas pendientes" del panel del
// fisio / head_success.
//
// Lógica:
//   Cada paciente tiene un intervalo (loadReviewIntervalWeeks, 2/3/4/5)
//   y la fecha de la última revisión (loadReviewLastAt).
//   - referenceDate = loadReviewLastAt || startedAt
//   - dueDate       = referenceDate + intervalWeeks * 7 días
//   - Aparece como "pendiente" si today >= dueDate.

import { prisma } from "@/lib/prisma";

export type LoadReviewItem = {
  patientId: string;
  patientName: string;
  intervalWeeks: number;
  /** Fecha de la última revisión (o de inicio si nunca se ha revisado). ISO. */
  referenceDateIso: string;
  /** Fecha en que tocaría revisarla. ISO. */
  dueDateIso: string;
  /** Días de retraso desde la fecha en que tocaba (0 = toca hoy, positivo = retraso). */
  daysOverdue: number;
  /** true si nunca se ha revisado todavía. */
  firstTime: boolean;
};

/**
 * Devuelve los pacientes del profesional cuya revisión de cargas ya toca.
 *
 * Si `professionalId` es null/empty → devuelve todos los pacientes (uso para
 * head_success cuando quiera ver el global).
 */
export async function getLoadReviewsForProfessional(
  professionalId: string | null,
  opts?: { all?: boolean },
): Promise<LoadReviewItem[]> {
  const all = opts?.all ?? false;
  const where: any = {};
  if (!all && professionalId) {
    where.assignedProfessionalId = professionalId;
  }

  const patients = await prisma.patient.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      startedAt: true,
      loadReviewIntervalWeeks: true,
      loadReviewLastAt: true,
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const items: LoadReviewItem[] = [];
  for (const p of patients) {
    const interval = p.loadReviewIntervalWeeks || 4;
    const ref = p.loadReviewLastAt ?? p.startedAt;
    if (!ref) continue;
    const due = new Date(ref);
    due.setDate(due.getDate() + interval * 7);
    due.setHours(0, 0, 0, 0);

    if (today.getTime() < due.getTime()) continue; // todavía no toca

    const daysOverdue = Math.max(0, Math.round((today.getTime() - due.getTime()) / 86400000));
    items.push({
      patientId: p.id,
      patientName: p.fullName,
      intervalWeeks: interval,
      referenceDateIso: new Date(ref).toISOString(),
      dueDateIso: due.toISOString(),
      daysOverdue,
      firstTime: !p.loadReviewLastAt,
    });
  }

  // Más retraso primero
  items.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return items;
}
