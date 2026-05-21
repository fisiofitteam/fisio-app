import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/auth";
import { InviteView } from "./InviteView";

export default async function EquipoPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio");

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

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Equipo</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Gestiona el acceso del equipo a la app</p>
      </header>
      <InviteView team={team} />
    </main>
  );
}
