import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/auth";
import { EquipoTabs } from "@/components/EquipoTabs";

export default async function EquipoPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  // Tab activa. Por defecto: "calendario" para todos, "miembros" para CEO.
  const isManager = user.role === "ceo" || user.role === "head_success";
  const tab = searchParams.tab === "miembros" || searchParams.tab === "calendario"
    ? searchParams.tab
    : (user.role === "ceo" ? "miembros" : "calendario");

  // Lista de miembros (solo necesaria si es manager o si está en cualquier tab)
  const pros = await prisma.professional.findMany({
    orderBy: [{ active: "desc" }, { fullName: "asc" }],
    select: {
      id: true, fullName: true, email: true, role: true, active: true,
      passwordHash: true, passwordResetToken: true, passwordResetExpires: true,
      lastLoginAt: true,
    },
  });

  const now = new Date();
  const team = pros.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    email: p.email,
    role: p.role,
    active: p.active,
    hasPassword: !!p.passwordHash,
    pendingInvite: !p.passwordHash && !!p.passwordResetToken && !!p.passwordResetExpires && p.passwordResetExpires > now,
    lastLoginAt: p.lastLoginAt?.toISOString() ?? null,
  }));

  // Vacaciones próximas y pasadas (3 meses atrás y 6 adelante)
  const horizonStart = new Date();
  horizonStart.setMonth(horizonStart.getMonth() - 3);
  const horizonEnd = new Date();
  horizonEnd.setMonth(horizonEnd.getMonth() + 6);

  const leaves = await prisma.professionalLeave.findMany({
    where: {
      status: { in: ["scheduled", "applied"] },
      endDate: { gte: horizonStart },
      startDate: { lte: horizonEnd },
    },
    include: { professional: { select: { id: true, fullName: true, role: true } } },
    orderBy: { startDate: "asc" },
  });

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Equipo</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          {isManager ? "Gestiona el acceso del equipo y las vacaciones" : "Vacaciones y disponibilidad del equipo"}
        </p>
      </header>

      <EquipoTabs
        activeTab={tab}
        isManager={isManager}
        team={team}
        leaves={leaves.map((l) => ({
          id: l.id,
          professionalId: l.professionalId,
          professionalName: l.professional.fullName,
          professionalRole: l.professional.role,
          startDate: l.startDate.toISOString(),
          endDate: l.endDate.toISOString(),
          status: l.status,
          daysApplied: l.daysApplied,
          affectedPatientsCount: l.affectedPatientsCount,
          notes: l.notes,
        }))}
      />
    </main>
  );
}
