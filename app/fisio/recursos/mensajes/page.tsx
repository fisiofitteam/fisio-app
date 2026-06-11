import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { MessageTemplatesList } from "@/components/MessageTemplatesList";
import { ResourceRoleTabs } from "@/components/ResourceRoleTabs";
import { CloserIntrosBlock } from "@/components/CloserIntrosBlock";
import {
  assignableRolesForUser,
  canManageResources,
  parseTargetRoles,
  resolveActiveRole,
  templateVisibleFor,
  visibleRolesForUser,
  type ResourceRole,
} from "@/lib/resource-roles";

export default async function MessagesPage({ searchParams }: { searchParams: { rol?: string } }) {
  const user = (await getActiveProfessional())!;
  const proRole = user.role as ResourceRole;
  const { role } = resolveActiveRole(proRole, searchParams?.rol);
  const allowedRoles = visibleRolesForUser(proRole);
  const canManage = canManageResources(proRole);
  const assignable = assignableRolesForUser(proRole);

  // Para el bloque de presentaciones: solo CEO + closers activos (son los que
  // realmente usan {closer.intro} al enviar plantillas desde Llamadas).
  const closerMembers = canManage
    ? await prisma.professional.findMany({
        where: { active: true, role: { in: ["ceo", "closer"] } },
        orderBy: [{ role: "asc" }, { fullName: "asc" }],
        select: { id: true, fullName: true, role: true, closerIntro: true },
      })
    : [];

  // `targetRoles` es un JSON string en BD; el filtrado por rol se hace en Node
  // porque Prisma no permite query sobre arrays serializados. El coste es
  // despreciable: docenas de plantillas, no miles.
  const allRaw = await prisma.messageTemplate.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const all = allRaw.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    targetRoles: parseTargetRoles(m.targetRoles),
    body: m.body,
    actionType: (m.actionType ?? null) as any,
  }));

  const visible = all.filter((m) => {
    if (!templateVisibleFor(m.targetRoles, proRole)) return false;
    if (role === "all") return true;
    return m.targetRoles.includes(role);
  });

  return (
    <div>
      <ResourceRoleTabs allowedRoles={allowedRoles} currentRole={role} />
      {canManage && <CloserIntrosBlock members={closerMembers} />}
      <MessageTemplatesList
        messages={visible}
        canManage={canManage}
        assignableRoles={assignable}
        defaultRoles={role === "all" ? [proRole] : [role]}
      />
    </div>
  );
}
