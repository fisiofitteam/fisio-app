import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { calculateAdherence } from "@/lib/adherence";
import { ClinicalSessionsView } from "@/components/ClinicalSessionsView";

export const dynamic = "force-dynamic";

function monthsConsumed(start: Date | null): number {
  if (!start) return 0;
  return Math.max(0, (Date.now() - new Date(start).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

export default async function ReunionesPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  // Las sesiones clínicas son del área clínica + dirección. Setter/closer (ventas) no.
  const canClinical = user.role === "ceo" || user.role === "head_success" || user.role === "fisio";
  if (!canClinical) {
    return (
      <div>
        <header className="mb-4">
          <h1 className="text-xl font-semibold">Reuniones</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Próximamente</p>
        </header>
        <div className="card text-center py-12 text-sm text-neutral-500">
          Aún no hay tipos de reunión disponibles para tu rol.
        </div>
      </div>
    );
  }

  const [cases, patients, professionals] = await Promise.all([
    prisma.clinicalSessionCase.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        patient: {
          select: {
            fullName: true,
            assignedProfessionalId: true,
            bodyZone: true,
            programType: true,
            subscriptionStartDate: true,
            subscriptionTotalMonths: true,
            appliedLevel: { select: { name: true, profile: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.patient.findMany({
      select: { id: true, fullName: true, assignedProfessionalId: true, bodyZone: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.professional.findMany({
      where: { active: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  // Cumplimiento por paciente (pocos casos → coste asumible)
  const adherences = await Promise.all(cases.map((c) => calculateAdherence(c.patientId)));

  return (
    <ClinicalSessionsView
      currentUserId={user.id}
      isCeo={user.role === "ceo"}
      professionals={professionals}
      patients={patients.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        assignedToId: p.assignedProfessionalId,
        bodyZone: p.bodyZone,
      }))}
      initialCases={cases.map((c, i) => ({
        id: c.id,
        patientId: c.patientId,
        patientName: c.patient.fullName,
        assignedToId: c.patient.assignedProfessionalId,
        bodyZone: c.patient.bodyZone,
        programType: c.patient.programType,
        appliedLevelName: c.patient.appliedLevel
          ? `${c.patient.appliedLevel.profile.name} · ${c.patient.appliedLevel.name}`
          : null,
        hasSubscription: c.patient.subscriptionStartDate != null,
        subConsumed: monthsConsumed(c.patient.subscriptionStartDate),
        subTotal: c.patient.subscriptionTotalMonths || 4,
        adhCompleted: adherences[i].completed,
        adhTotal: adherences[i].total,
        status: c.status,
        situation: c.situation,
        proposedSolutions: c.proposedSolutions,
        consensusSolution: c.consensusSolution,
      }))}
    />
  );
}
