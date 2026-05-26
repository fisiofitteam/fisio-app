// Detección de programas asignados (ProgramAssignment) próximos a terminar.
// El fin es startDate + weeksCount semanas. Cuando faltan ≤7 días, se notifica
// al fisio asignado (y se muestra en su panel). Las notificaciones se
// deduplican por refKey = "program_ending:<assignmentId>".
import { prisma } from "@/lib/prisma";

const DAY = 86400000;
const NOTIFY_TYPE = "program_ending";

export type ProgramEnding = {
  assignmentId: string;
  patientId: string;
  patientName: string;
  programName: string;
  weeksCount: number;
  endDate: string;       // ISO
  daysLeft: number;      // 0..7
  reviewed: boolean;
  notificationId: string | null;
};

function endOf(startDate: Date, weeksCount: number): Date {
  const end = new Date(startDate);
  end.setDate(end.getDate() + weeksCount * 7);
  return end;
}

// Devuelve los programas del fisio que terminan en ≤7 días, asegurando que
// exista la notificación de campanita para cada uno. Incluye el estado de
// "revisado" (la notificación marcada como leída).
export async function getProgramEndingsForProfessional(professionalId: string): Promise<ProgramEnding[]> {
  const now = new Date();

  const assignments = await prisma.programAssignment.findMany({
    where: { isActive: true, patient: { assignedProfessionalId: professionalId } },
    include: {
      patient: { select: { id: true, fullName: true } },
      program: { select: { name: true } },
    },
  });

  const ending = assignments
    .map((a) => {
      const end = endOf(a.startDate, a.weeksCount);
      const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY);
      return { a, end, daysLeft };
    })
    .filter((x) => x.daysLeft >= 0 && x.daysLeft <= 7);

  // Asegurar notificación por cada programa próximo a terminar (idempotente).
  for (const { a, end, daysLeft } of ending) {
    const refKey = `${NOTIFY_TYPE}:${a.id}`;
    const exists = await prisma.teamNotification.findFirst({ where: { refKey }, select: { id: true } });
    if (!exists) {
      await prisma.teamNotification.create({
        data: {
          targetProfessionalId: professionalId,
          type: NOTIFY_TYPE,
          refKey,
          title: "Programa a punto de terminar",
          body: `El programa "${a.program.name}" de ${a.patient.fullName} termina ${
            daysLeft === 0 ? "hoy" : `en ${daysLeft} día${daysLeft === 1 ? "" : "s"}`
          }. Prepara el siguiente bloque.`,
          actionUrl: `/fisio/paciente/${a.patient.id}/calendario`,
        },
      });
    }
  }

  // Leer el estado de las notificaciones para devolver "revisado".
  const refKeys = ending.map(({ a }) => `${NOTIFY_TYPE}:${a.id}`);
  const notifs = refKeys.length
    ? await prisma.teamNotification.findMany({ where: { refKey: { in: refKeys } }, select: { id: true, refKey: true, readAt: true } })
    : [];
  const byKey = new Map(notifs.map((n) => [n.refKey, n]));

  return ending
    .map(({ a, end, daysLeft }) => {
      const n = byKey.get(`${NOTIFY_TYPE}:${a.id}`);
      return {
        assignmentId: a.id,
        patientId: a.patient.id,
        patientName: a.patient.fullName,
        programName: a.program.name,
        weeksCount: a.weeksCount,
        endDate: end.toISOString(),
        daysLeft,
        reviewed: !!n?.readAt,
        notificationId: n?.id ?? null,
      };
    })
    .sort((x, y) => x.daysLeft - y.daysLeft);
}

// Solo asegura las notificaciones (para la campanita), sin construir la lista.
export async function syncProgramEndingNotifications(professionalId: string): Promise<void> {
  await getProgramEndingsForProfessional(professionalId);
}
