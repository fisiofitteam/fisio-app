import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { calculateAdherence } from "@/lib/adherence";
import { ClinicalSessionsView } from "@/components/ClinicalSessionsView";
import { ReunionesTabs } from "@/components/ReunionesTabs";
import { TeamMeetingsList } from "@/components/TeamMeetingsList";
import {
  visibleCategoriesFor,
  isManagerForCategory,
  canSeeOtherMeeting,
  parseAttendeeIds,
  type MeetingCategory,
} from "@/lib/team-meetings";
import { getSubscriptionProgressBatch } from "@/lib/subscription-progress";

export const dynamic = "force-dynamic";

export default async function ReunionesPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  const visibleCats = visibleCategoriesFor(user.role);
  if (visibleCats.length === 0) {
    return (
      <div>
        <header className="mb-4">
          <h1 className="text-xl font-semibold">Reuniones</h1>
        </header>
        <div className="card text-center py-12 text-sm text-neutral-500">
          Tu rol no tiene reuniones asignadas.
        </div>
      </div>
    );
  }

  // Profesionales (para picker de "Otras" y para mostrar nombres)
  const professionals = await prisma.professional.findMany({
    where: { active: true },
    select: { id: true, fullName: true, role: true },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  // ── Cargar reuniones de las categorías no-clinical que ve el usuario ─────
  const teamMeetingsByCategory: Partial<Record<MeetingCategory, any[]>> = {};
  await Promise.all(
    visibleCats
      .filter((c) => c !== "clinical")
      .map(async (cat) => {
        const rows = await prisma.teamMeeting.findMany({
          where: { category: cat },
          orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
        });
        let mapped = rows.map((m) => ({
          id: m.id,
          category: m.category,
          title: m.title,
          scheduledAt: m.scheduledAt?.toISOString() ?? null,
          preparation: m.preparation,
          summary: m.summary,
          status: m.status,
          attendeeIds: parseAttendeeIds(m.attendeeIds),
        }));
        // En "Otras", si no es manager, solo ve las que tiene asignadas como attendee.
        if (cat === "other" && !isManagerForCategory(user.role, "other")) {
          mapped = mapped.filter((m) => canSeeOtherMeeting(user.role, user.id, m.attendeeIds));
        }
        teamMeetingsByCategory[cat] = mapped;
      })
  );

  // ── Sesiones clínicas (modelo existente) — solo si tiene acceso ─────────
  let clinicalContent: React.ReactNode = null;
  if (visibleCats.includes("clinical")) {
    const [cases, patients] = await Promise.all([
      prisma.clinicalSessionCase.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          patient: {
            select: {
              fullName: true, assignedProfessionalId: true, bodyZone: true, programType: true,
              subscriptionStartDate: true, subscriptionTotalMonths: true,
              appliedLevel: { select: { name: true, profile: { select: { name: true } } } },
            },
          },
        },
      }),
      prisma.patient.findMany({
        select: { id: true, fullName: true, assignedProfessionalId: true, bodyZone: true },
        orderBy: { fullName: "asc" },
      }),
    ]);
    const adherences = await Promise.all(cases.map((c) => calculateAdherence(c.patientId)));
    const progressBySubCase = await getSubscriptionProgressBatch(
      cases.map((c: any) => ({
        id: c.patientId,
        subscriptionStartDate: c.patient.subscriptionStartDate ?? null,
        subscriptionPeriodMonths: c.patient.subscriptionPeriodMonths ?? c.patient.subscriptionTotalMonths ?? 4,
        subscriptionTotalMonths: c.patient.subscriptionTotalMonths ?? 4,
      }))
    );

    clinicalContent = (
      <ClinicalSessionsView
        currentUserId={user.id}
        isCeo={user.role === "ceo"}
        professionals={professionals.map((p) => ({ id: p.id, fullName: p.fullName }))}
        patients={patients.map((p) => ({
          id: p.id, fullName: p.fullName, assignedToId: p.assignedProfessionalId, bodyZone: p.bodyZone,
        }))}
        initialCases={cases.map((c, i) => ({
          id: c.id, patientId: c.patientId, patientName: c.patient.fullName,
          assignedToId: c.patient.assignedProfessionalId, bodyZone: c.patient.bodyZone,
          programType: c.patient.programType,
          appliedLevelName: c.patient.appliedLevel ? `${c.patient.appliedLevel.profile.name} · ${c.patient.appliedLevel.name}` : null,
          hasSubscription: c.patient.subscriptionStartDate != null,
          subConsumed: progressBySubCase[c.patientId]?.consumedMonths ?? 0,
          subTotal: progressBySubCase[c.patientId]?.totalMonths ?? (c.patient.subscriptionTotalMonths || 4),
          currentWeek: progressBySubCase[c.patientId]?.currentWeek ?? null,
          isPausedNow: !!progressBySubCase[c.patientId]?.isPaused,
          adhCompleted: adherences[i].completed,
          adhTotal: adherences[i].total,
          status: c.status, situation: c.situation,
          proposedSolutions: c.proposedSolutions, consensusSolution: c.consensusSolution,
        }))}
      />
    );
  }

  // Construir contenidos por pestaña
  const contents: Partial<Record<MeetingCategory, React.ReactNode>> = {};
  for (const cat of visibleCats) {
    if (cat === "clinical") {
      contents[cat] = clinicalContent;
      continue;
    }
    contents[cat] = (
      <TeamMeetingsList
        category={cat}
        meetings={teamMeetingsByCategory[cat] ?? []}
        professionals={professionals}
        canManage={isManagerForCategory(user.role, cat)}
      />
    );
  }

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Reuniones</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Prepara, registra y consulta las reuniones del equipo.
        </p>
      </header>

      <ReunionesTabs visibleCategories={visibleCats} contents={contents} />
    </main>
  );
}
