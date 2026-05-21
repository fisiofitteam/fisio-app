import { prisma } from "@/lib/prisma";
import { calculateAdherence } from "@/lib/adherence";
import { getActiveProfessional } from "@/lib/session";
import { PatientsList } from "@/components/PatientsList";

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

  const patients = await prisma.patient.findMany({
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

  return (
    <PatientsList
      patients={mapped}
      currentUser={{ id: user.id, fullName: user.fullName, isManager: user.isManager }}
      tab={tab}
      counts={counts}
      professionals={professionals.map((p) => ({ id: p.id, fullName: p.fullName, role: p.role }))}
    />
  );
}
