import { prisma } from "@/lib/prisma";
import { calculateAdherence } from "@/lib/adherence";
import { getActiveProfessional } from "@/lib/session";
import { PatientsList } from "@/components/PatientsList";
import { AdvanceDashboard } from "@/components/AdvanceDashboard";
import { todayMadridUtc } from "@/lib/program-pauses";

function monthsConsumed(startDate: Date | null): number {
  if (!startDate) return 0;
  const now = new Date();
  const diffMs = now.getTime() - new Date(startDate).getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 30.44));
}

export default async function PatientsListPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const user = (await getActiveProfessional())!;

  // Si no es manager, fuerza tab=mine (solo ve los suyos)
  const tab = user.isManager ? (searchParams.tab ?? "all") : "mine";

  const professionals = user.isManager
    ? await prisma.professional.findMany({
        where: { role: { in: ["fisio", "head_success"] } },
        orderBy: { fullName: "asc" },
      })
    : [];

  // Programas rolling activos (para el modal de "Nuevo paciente")
  const rollingPrograms = user.isManager
    ? await prisma.rollingProgram.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  // Filtro según tab
  let where: any = {};
  if (tab === "mine") {
    where = { assignedProfessionalId: user.id };
  } else if (tab === "unassigned") {
    where = { assignedProfessionalId: null };
  } else if (tab.startsWith("pro:")) {
    const proId = tab.slice(4);
    where = { assignedProfessionalId: proId };
  }
  // tab === "all" → sin filtro

  // Si estamos en la pestaña ADVANCE, no necesitamos cargar la lista (no se
  // renderiza). Saltamos la query pesada de pacientes + adherencias.
  const patients = tab === "advance"
    ? []
    : await prisma.patient.findMany({
        where,
        include: {
          _count: { select: { adaptations: true, programAssignments: true } },
          appliedLevel: { include: { profile: true } },
          assignedProfessional: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: { fullName: "asc" },
      });

  // Contar por pestaña (solo si es manager)
  let counts: { all: number; unassigned: number; mine: number; byPro: Record<string, number> } = {
    all: 0,
    unassigned: 0,
    mine: 0,
    byPro: {},
  };
  if (user.isManager) {
    const all = await prisma.patient.findMany({ select: { assignedProfessionalId: true } });
    counts.all = all.length;
    counts.unassigned = all.filter((p) => p.assignedProfessionalId === null).length;
    counts.mine = all.filter((p) => p.assignedProfessionalId === user.id).length;
    for (const pro of professionals) {
      counts.byPro[pro.id] = all.filter((p) => p.assignedProfessionalId === pro.id).length;
    }
  }

  const adherences = await Promise.all(patients.map((p) => calculateAdherence(p.id)));

  const mapped = patients.map((p, idx) => {
    const renewalDays = p.subscriptionStartDate
      ? Math.round(
          (new Date(new Date(p.subscriptionStartDate).setMonth(new Date(p.subscriptionStartDate).getMonth() + p.subscriptionPeriodMonths)).getTime() -
            Date.now()) / 86400000
        )
      : null;
    return {
      id: p.id,
      fullName: p.fullName,
      diagnosis: p.diagnosis ?? "",
      bodyZone: p.bodyZone ?? null,
      appliedLevelName: p.appliedLevel ? `${p.appliedLevel.profile.name} · ${p.appliedLevel.name}` : null,
      whatsappGroupUrl: p.whatsappGroupUrl,
      subscriptionStartDate: p.subscriptionStartDate?.toISOString() ?? null,
      subscriptionTotalMonths: p.subscriptionTotalMonths,
      renewalDays,
      consumedMonths: monthsConsumed(p.subscriptionStartDate),
      adherenceCompleted: adherences[idx].completed,
      adherenceTotal: adherences[idx].total,
      adaptationsCount: p._count.adaptations,
      programsCount: p._count.programAssignments,
      programType: p.programType,
      difficulty: p.difficulty,
      assignedProfessional: p.assignedProfessional
        ? { id: p.assignedProfessional.id, fullName: p.assignedProfessional.fullName, role: p.assignedProfessional.role }
        : null,
    };
  });

  // Dashboard ADVANCE (solo si tab=advance y manager). Calculamos en server
  // los agregados de los últimos 60 días y pasamos el componente ya renderizado
  // como ReactNode a PatientsList, que decide cuándo mostrarlo.
  let advanceDashboard: React.ReactNode = null;
  if (user.isManager && tab === "advance") {
    const today = todayMadridUtc();
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 59); // 60 días incluyendo hoy

    const [logs, advanceRollingPatients] = await Promise.all([
      prisma.patientDailyLog.findMany({
        where: { recordedDate: { gte: start } },
        select: {
          patientId: true,
          recordedDate: true,
          fatigue: true,
          rpe: true,
          sleep: true,
        },
      }).catch(() => [] as any[]),
      prisma.patient.count({
        where: {
          programMode: "rolling",
          OR: [
            { rollingAccessoriesId: { not: null } },
            { rollingTrainingId: { not: null } },
            { rollingProgramId: { not: null } },
          ],
        },
      }),
    ]);

    // Construir mapa día -> agregado
    type Bucket = { fatigue: number[]; rpe: number[]; sleep: number[] };
    const byDay = new Map<string, Bucket>();
    for (let i = 0; i < 60; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      byDay.set(d.toISOString(), { fatigue: [], rpe: [], sleep: [] });
    }
    const todayMs = today.getTime();
    const sevenAgoMs = todayMs - 6 * 86400000;
    const thirtyAgoMs = todayMs - 29 * 86400000;
    const loggers7 = new Set<string>();
    const loggers30 = new Set<string>();

    for (const e of logs) {
      const key = e.recordedDate.toISOString();
      const b = byDay.get(key);
      if (b) {
        b.fatigue.push(e.fatigue);
        b.rpe.push(e.rpe);
        b.sleep.push(e.sleep);
      }
      const ms = e.recordedDate.getTime();
      if (ms >= thirtyAgoMs) loggers30.add(e.patientId);
      if (ms >= sevenAgoMs) loggers7.add(e.patientId);
    }
    const avg = (xs: number[]) => xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
    const daily = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateIso, b]) => ({
        dateIso,
        fatigueAvg: avg(b.fatigue),
        rpeAvg: avg(b.rpe),
        sleepAvg: avg(b.sleep),
        entries: b.fatigue.length,
      }));

    advanceDashboard = (
      <AdvanceDashboard
        daily={daily}
        advanceRollingPatients={advanceRollingPatients}
        uniqueLoggers7d={loggers7.size}
        uniqueLoggers30d={loggers30.size}
      />
    );
  }

  return (
    <PatientsList
      patients={mapped}
      currentUser={{ id: user.id, fullName: user.fullName, isManager: user.isManager, role: user.role }}
      tab={tab}
      counts={counts}
      professionals={professionals.map((p) => ({ id: p.id, fullName: p.fullName, role: p.role }))}
      rollingPrograms={rollingPrograms}
      advanceDashboard={advanceDashboard}
    />
  );
}
