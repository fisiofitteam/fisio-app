import { prisma } from "@/lib/prisma";
import { todayMadridUtc } from "@/lib/program-pauses";
import { AdvanceAthletesList } from "@/components/AdvanceAthletesList";

// /fisio/advance/atletas — lista de atletas ADVANCE rolling con RPE y fatiga
// media de los últimos 7 días. Enfocada en el estado interno del atleta,
// no en la suscripción/cumplimiento (para eso está la vista de pacientes).
// Acceso restringido por el layout a CEO + head_success.
export default async function AdvanceAthletesPage() {
  const today = todayMadridUtc();
  const sevenAgo = new Date(today);
  sevenAgo.setUTCDate(sevenAgo.getUTCDate() - 6); // 7 días incluyendo hoy

  const athletes = await prisma.patient.findMany({
    where: {
      programMode: "rolling",
      OR: [
        { rollingAccessoriesId: { not: null } },
        { rollingTrainingId: { not: null } },
        { rollingProgramId: { not: null } },
      ],
    },
    select: {
      id: true,
      fullName: true,
      photoUrl: true,
      sport: true,
      phone: true,
      assignedProfessional: { select: { id: true, fullName: true } },
    },
    orderBy: { fullName: "asc" },
  });

  const logs = await prisma.patientDailyLog
    .findMany({
      where: {
        patientId: { in: athletes.map((a) => a.id) },
        recordedDate: { gte: sevenAgo },
      },
      select: { patientId: true, rpe: true, fatigue: true, recordedDate: true },
    })
    .catch(() => [] as { patientId: string; rpe: number; fatigue: number; recordedDate: Date }[]);

  type Bucket = { rpe: number[]; fatigue: number[]; lastEntryAt: Date | null };
  const byPatient = new Map<string, Bucket>();
  for (const l of logs) {
    const b = byPatient.get(l.patientId) ?? { rpe: [], fatigue: [], lastEntryAt: null };
    b.rpe.push(l.rpe);
    b.fatigue.push(l.fatigue);
    if (!b.lastEntryAt || l.recordedDate > b.lastEntryAt) b.lastEntryAt = l.recordedDate;
    byPatient.set(l.patientId, b);
  }
  const avg = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

  const rows = athletes.map((a) => {
    const b = byPatient.get(a.id);
    return {
      id: a.id,
      fullName: a.fullName,
      photoUrl: a.photoUrl,
      sport: a.sport,
      phone: a.phone,
      fisio: a.assignedProfessional
        ? { id: a.assignedProfessional.id, fullName: a.assignedProfessional.fullName }
        : null,
      rpeAvg: b ? avg(b.rpe) : null,
      fatigueAvg: b ? avg(b.fatigue) : null,
      entries7d: b?.rpe.length ?? 0,
      lastEntryAt: b?.lastEntryAt?.toISOString() ?? null,
    };
  });

  return <AdvanceAthletesList athletes={rows} />;
}
