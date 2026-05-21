import { prisma } from "./prisma";

// Devuelve { completed, total, percentage } de las sesiones que ya han tocado hasta hoy
export async function calculateAdherence(patientId: string): Promise<{
  completed: number;
  total: number;
  percentage: number;
}> {
  const now = new Date();
  now.setHours(23, 59, 59, 999); // hasta el final del día actual

  const sessions = await prisma.programSession.findMany({
    where: {
      assignment: { patientId, isActive: true },
      scheduledDate: { lte: now },
    },
    select: { id: true, completedAt: true },
  });

  const total = sessions.length;
  const completed = sessions.filter((s) => s.completedAt !== null).length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

  return { completed, total, percentage };
}
