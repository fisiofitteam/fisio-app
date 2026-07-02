import { prisma } from "@/lib/prisma";
import { calculateAdherence } from "@/lib/adherence";
import { getActiveProfessional } from "@/lib/session";
import { PatientsList } from "@/components/PatientsList";
import { SetterPatientsView } from "@/components/SetterPatientsView";

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

  // Setter ve una vista simplificada: solo info de envío y fiscal de TODOS los
  // pacientes. No ve diagnóstico, programa, adherencia, etc.
  if (user.role === "setter") {
    const patients = await prisma.patient.findMany({
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        email: true,
        programType: true,
        country: true,
        contractDNI: true,
        shirtSize: true,
        shippingAddress: true,
        shippingStreet: true,
        shippingNumber: true,
        shippingFloor: true,
        shippingStaircase: true,
        shippingDoor: true,
        shippingCity: true,
        shippingProvince: true,
        shippingPostalCode: true,
        shippingPhone: true,
      },
    });
    return (
      <SetterPatientsView
        patients={patients.map((p) => ({
          id: p.id,
          fullName: p.fullName,
          email: p.email ?? null,
          programType: p.programType,
          country: p.country,
          contractDNI: p.contractDNI,
          shirtSize: p.shirtSize,
          shippingAddress: p.shippingAddress,
          shippingStreet: p.shippingStreet,
          shippingNumber: p.shippingNumber,
          shippingFloor: p.shippingFloor,
          shippingStaircase: p.shippingStaircase,
          shippingDoor: p.shippingDoor,
          shippingCity: p.shippingCity,
          shippingProvince: p.shippingProvince,
          shippingPostalCode: p.shippingPostalCode,
          shippingPhone: p.shippingPhone,
        }))}
      />
    );
  }

  // Si no es manager, fuerza tab=mine (solo ve los suyos).
  // Head_success: default a "mine" para que se centre en sus pacientes; las
  // pestañas "Todos" / "Por asignar" siguen disponibles si las necesita.
  // CEO: default a "all" como antes.
  const defaultTab = user.role === "head_success" ? "mine" : "all";
  // Fisios normales solo pueden estar en "mine" o "finished". El resto
  // de tabs son solo-manager.
  const requestedTab = searchParams.tab ?? defaultTab;
  const tab = user.isManager
    ? requestedTab
    : requestedTab === "finished"
      ? "finished"
      : "mine";

  // Incluimos también al CEO como profesional al que se le pueden asignar
  // pacientes (aparece como pestaña propia y como opción en el selector
  // de "Fisio asignado" al crear/reasignar). PatientsList ya oculta la
  // pestaña del propio usuario para no duplicar "Míos".
  const professionals = user.isManager
    ? await prisma.professional.findMany({
        where: { role: { in: ["fisio", "head_success", "ceo"] } },
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
  } else if (tab === "finished") {
    // Pacientes terminados: sin ningún SubscriptionRenewal activo con
    // endDate en el futuro. Filtramos por el patient.id abajo después
    // de resolver quiénes cumplen la condición.
    if (user.isManager) {
      // Manager ve todos. Aplicamos el filtro real más abajo.
    } else {
      // Fisios normales solo ven los suyos.
      where = { assignedProfessionalId: user.id };
    }
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
  let counts: { all: number; unassigned: number; mine: number; finished: number; byPro: Record<string, number> } = {
    all: 0,
    unassigned: 0,
    mine: 0,
    finished: 0,
    byPro: {},
  };
  if (user.isManager) {
    const all = await prisma.patient.findMany({ select: { id: true, assignedProfessionalId: true } });
    counts.all = all.length;
    counts.unassigned = all.filter((p) => p.assignedProfessionalId === null).length;
    counts.mine = all.filter((p) => p.assignedProfessionalId === user.id).length;
    for (const pro of professionals) {
      counts.byPro[pro.id] = all.filter((p) => p.assignedProfessionalId === pro.id).length;
    }
    // Terminados: sin ningún SubscriptionRenewal active con endDate > hoy.
    const allActive = await prisma.subscriptionRenewal.findMany({
      where: { patientId: { in: all.map((p) => p.id) }, status: "active" },
      select: { patientId: true, endDate: true },
    });
    const vigentes = new Set(
      allActive.filter((r) => r.endDate && r.endDate.getTime() > Date.now()).map((r) => r.patientId)
    );
    counts.finished = all.filter((p) => !vigentes.has(p.id)).length;
  } else {
    // Fisios normales: contar solo sus terminados para el badge.
    const mine = await prisma.patient.findMany({
      where: { assignedProfessionalId: user.id },
      select: { id: true },
    });
    const active = await prisma.subscriptionRenewal.findMany({
      where: { patientId: { in: mine.map((p) => p.id) }, status: "active" },
      select: { patientId: true, endDate: true },
    });
    const vigentes = new Set(
      active.filter((r) => r.endDate && r.endDate.getTime() > Date.now()).map((r) => r.patientId)
    );
    counts.finished = mine.filter((p) => !vigentes.has(p.id)).length;
  }

  const adherences = await Promise.all(patients.map((p) => calculateAdherence(p.id)));

  // Fin del periodo activo por paciente. Es la fuente de verdad porque
  // /api/program-pauses actualiza SubscriptionRenewal.endDate cuando el
  // fisio añade una pausa; hasta ahora la lista ignoraba ese campo y
  // calculaba renewalDays desde subscriptionStartDate + periodMonths,
  // que no reflejaba las pausas cortas (< 30 días).
  const activePeriods = await prisma.subscriptionRenewal.findMany({
    where: { patientId: { in: patients.map((p) => p.id) }, status: "active" },
    select: { patientId: true, endDate: true },
  });
  const activeEndByPatient = new Map<string, Date>();
  for (const r of activePeriods) {
    if (r.endDate) activeEndByPatient.set(r.patientId, r.endDate);
  }

  // Para el bloque "Terminados": último endDate de cualquier
  // SubscriptionRenewal del paciente (independiente del status). Sirve
  // para mostrar "Terminó el X" y para el filtro "últimos 30 días".
  const allRenewalsForPatients = await prisma.subscriptionRenewal.findMany({
    where: { patientId: { in: patients.map((p) => p.id) } },
    select: { patientId: true, endDate: true },
    orderBy: { endDate: "desc" },
  });
  const lastEndByPatient = new Map<string, Date>();
  for (const r of allRenewalsForPatients) {
    if (r.endDate && !lastEndByPatient.has(r.patientId)) {
      lastEndByPatient.set(r.patientId, r.endDate);
    }
  }

  // Grupo del paciente para la vista escalonada por etapa:
  //   - "onboarding": NO legacy, week0CompletedAt null, subscriptionStartDate
  //     dentro de los últimos 14 días. Recuadro amarillo arriba.
  //   - "first_weeks": no onboarding, subscriptionStartDate dentro de las
  //     últimas 4 semanas. Recuadro gris claro.
  //   - "steady": el resto. Vista habitual.
  const now = Date.now();
  const DAYS_14_MS = 14 * 86400000;
  const WEEKS_4_MS = 28 * 86400000;
  function groupFor(p: (typeof patients)[number]): "onboarding" | "first_weeks" | "steady" {
    const start = p.subscriptionStartDate?.getTime() ?? null;
    if (start === null) return "steady";
    const elapsed = now - start;
    // Legacies (migrados) nunca entran en onboarding. Doble criterio:
    //   - giftsAlreadySent = true: lo marcan las altas legacy modernas.
    //   - onboardingTasks == null: los legacies NO rellenan el JSON de
    //     tareas de onboarding (ventas + alta manual sí lo hacen para
    //     pasar por el gate de anamnesis + contrato). Cubre los legacies
    //     antiguos que no marcaban giftsAlreadySent.
    const isLegacy = p.giftsAlreadySent === true || p.onboardingTasks == null;
    if (!isLegacy && !p.week0CompletedAt && elapsed <= DAYS_14_MS) {
      return "onboarding";
    }
    if (elapsed <= WEEKS_4_MS) return "first_weeks";
    return "steady";
  }

  const mapped = patients.map((p, idx) => {
    const activeEnd = activeEndByPatient.get(p.id);
    const renewalDays = activeEnd
      ? Math.round((activeEnd.getTime() - Date.now()) / 86400000)
      : p.subscriptionStartDate
      ? Math.round(
          (new Date(new Date(p.subscriptionStartDate).setMonth(new Date(p.subscriptionStartDate).getMonth() + p.subscriptionPeriodMonths)).getTime() -
            Date.now()) / 86400000
        )
      : null;
    const stage = groupFor(p);
    // "Terminado" = sin periodo activo con endDate en el futuro. Cubre
    // ambos casos: (1) no hay ningún SubscriptionRenewal activo,
    // (2) hay uno pero su endDate ya pasó (sanitize aún no lo cerró).
    const isFinished = !activeEnd || activeEnd.getTime() <= now;
    // Fecha en la que "terminó": el endDate más reciente de cualquier
    // renewal del paciente (incluso los finished antiguos). Sirve para
    // mostrar "Terminó el X" y para el filtro "últimos 30 días".
    const finishedAt = lastEndByPatient.get(p.id) ?? null;
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
      stage,
      isFinished,
      finishedAt: finishedAt?.toISOString() ?? null,
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

  // Aplicar filtro de pestaña "Terminados": solo pacientes con isFinished.
  // En otras pestañas, ocultamos los terminados para que no ensucien.
  const filtered = tab === "finished"
    ? mapped.filter((p) => p.isFinished)
    : mapped.filter((p) => !p.isFinished);

  return (
    <PatientsList
      patients={filtered}
      currentUser={{ id: user.id, fullName: user.fullName, isManager: user.isManager, role: user.role }}
      tab={tab}
      counts={counts}
      professionals={professionals.map((p) => ({ id: p.id, fullName: p.fullName, role: p.role }))}
      rollingPrograms={rollingPrograms}
    />
  );
}
