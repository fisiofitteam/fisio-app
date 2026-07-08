import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { PreventionAdminPanel } from "@/components/PreventionAdminPanel";

export const dynamic = "force-dynamic";

// Sub-tab "🛡 Prevention" dentro de /fisio/advance.
// Acceso restringido por el layout a CEO + head_success (igual que el resto
// de la sección Advance).
export default async function PreventionAdminPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const user = (await getActiveProfessional())!;
  if (user.role !== "ceo" && user.role !== "head_success") redirect("/fisio");

  const activeTab = searchParams.tab === "suscriptores" ? "suscriptores" : "rolling";

  // Datos comunes que necesita cualquier sub-tab
  const [programs, subscribers] = await Promise.all([
    prisma.rollingProgram.findMany({
      where: { role: "prevention" },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            patientsLegacy: true,
            patientsAccessories: true,
            patientsTraining: true,
            weeks: true,
          },
        },
      },
    }),
    prisma.patientSubscription.findMany({
      where: { productType: "prevention" },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            programType: true,
          },
        },
      },
    }),
  ]);

  return (
    <PreventionAdminPanel
      activeTab={activeTab}
      programs={programs.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        isActive: p.isActive,
        patientsCount:
          p._count.patientsLegacy +
          p._count.patientsAccessories +
          p._count.patientsTraining,
        weeksCount: p._count.weeks,
      }))}
      subscribers={subscribers.map((s) => ({
        id: s.id,
        patient: {
          id: s.patient.id,
          fullName: s.patient.fullName,
          email: s.patient.email,
          phone: s.patient.phone,
          programType: s.patient.programType,
        },
        plan: s.plan,
        status: s.status,
        amountCents: s.amountCents,
        currency: s.currency,
        currentPeriodStart: s.currentPeriodStart?.toISOString() ?? null,
        currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
        trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
        scheduledStartAt: s.scheduledStartAt?.toISOString() ?? null,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        originSource: s.originSource,
        createdAt: s.createdAt.toISOString(),
      }))}
    />
  );
}
