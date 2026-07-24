// Detección de PROGRAMAS ENTEROS asignados (ProgramAssignment con programa
// no-standalone) próximos a terminar. El fin es startDate + weeksCount semanas.
// Cuando faltan ≤7 días, se notifica al fisio asignado (UNA notificación por
// paciente, aunque tenga varios programas) y se muestra en su panel.
// Dedup por refKey = "program_ending:<patientId>".
import { prisma } from "@/lib/prisma";

const DAY = 86400000;
const NOTIFY_TYPE = "program_ending";

export type ProgramEnding = {
  patientId: string;
  patientName: string;
  programName: string;   // el programa que antes termina
  daysLeft: number;      // 0..7
  notificationId: string;
};

function endOf(startDate: Date, weeksCount: number): Date {
  const end = new Date(startDate);
  end.setDate(end.getDate() + weeksCount * 7);
  return end;
}

// Días que faltan para que termine un programa (negativo si ya terminó).
export function daysLeftForProgram(startDate: Date, weeksCount: number): number {
  return Math.ceil((endOf(startDate, weeksCount).getTime() - Date.now()) / DAY);
}

// Programas enteros del fisio que terminan en ≤7 días, agrupados por paciente
// (una entrada por paciente). Asegura una notificación por paciente y devuelve
// solo los que NO se han marcado como revisados.
export async function getProgramEndingsForProfessional(professionalId: string): Promise<ProgramEnding[]> {
  const now = new Date();

  const assignments = await prisma.programAssignment.findMany({
    where: {
      isActive: true,
      patient: { assignedProfessionalId: professionalId, isTest: false },
      program: { isStandalone: false }, // ← solo programas enteros, no sesiones sueltas
    },
    include: {
      patient: { select: { id: true, fullName: true } },
      program: { select: { name: true } },
    },
  });

  // Agrupar por paciente quedándonos con el programa que antes termina.
  const byPatient = new Map<string, { patientId: string; patientName: string; programName: string; daysLeft: number }>();
  for (const a of assignments) {
    const daysLeft = Math.ceil((endOf(a.startDate, a.weeksCount).getTime() - now.getTime()) / DAY);
    if (daysLeft < 0 || daysLeft > 7) continue;
    const cur = byPatient.get(a.patientId);
    if (!cur || daysLeft < cur.daysLeft) {
      byPatient.set(a.patientId, {
        patientId: a.patient.id,
        patientName: a.patient.fullName,
        programName: a.program.name,
        daysLeft,
      });
    }
  }

  const result: ProgramEnding[] = [];
  for (const p of byPatient.values()) {
    const refKey = `${NOTIFY_TYPE}:${p.patientId}`;
    let notif = await prisma.teamNotification.findFirst({ where: { refKey } });
    if (!notif) {
      notif = await prisma.teamNotification.create({
        data: {
          targetProfessionalId: professionalId,
          type: NOTIFY_TYPE,
          refKey,
          title: "Programa a punto de terminar",
          body: `${p.patientName}: un programa termina ${
            p.daysLeft === 0 ? "hoy" : `en ${p.daysLeft} día${p.daysLeft === 1 ? "" : "s"}`
          }. Prepara el siguiente bloque.`,
          actionUrl: `/fisio/paciente/${p.patientId}/calendario`,
        },
      });
    }
    if (notif.readAt) continue; // revisado → no mostrar
    result.push({ ...p, notificationId: notif.id });
  }

  return result.sort((a, b) => a.daysLeft - b.daysLeft);
}

// Solo asegura las notificaciones (para la campanita), sin construir la lista.
export async function syncProgramEndingNotifications(professionalId: string): Promise<void> {
  await getProgramEndingsForProfessional(professionalId);
}
