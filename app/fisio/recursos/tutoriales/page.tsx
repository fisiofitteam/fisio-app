import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ResourceRoleTabs } from "@/components/ResourceRoleTabs";
import { TutorialsModulesList } from "@/components/TutorialsModulesList";
import {
  parseTargetRoles,
  resolveActiveRole,
  templateVisibleFor,
  visibleRolesForUser,
  type ResourceRole,
} from "@/lib/resource-roles";
import { canManageTraining, moduleVisibleFor } from "@/lib/training";

export const dynamic = "force-dynamic";

export default async function TutorialesPage({ searchParams }: { searchParams: { rol?: string } }) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  const userRole = user.role as ResourceRole;
  const canManage = canManageTraining(user.role);
  const { role } = resolveActiveRole(userRole, searchParams?.rol);
  const allowedRoles = visibleRolesForUser(userRole);

  const modulesRaw = await prisma.trainingModule.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { sections: { select: { id: true, lessons: { select: { id: true } } } } },
  });

  const modules = modulesRaw
    .filter((m) => moduleVisibleFor(m.targetRoles, m.published, userRole, canManage))
    .filter((m) => role === "all" || parseTargetRoles(m.targetRoles).includes(role))
    .map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description ?? "",
      coverUrl: m.coverUrl,
      published: m.published,
      targetRoles: parseTargetRoles(m.targetRoles),
      sectionsCount: m.sections.length,
      lessonsCount: m.sections.reduce((acc, s) => acc + s.lessons.length, 0),
    }));

  return (
    <div>
      <ResourceRoleTabs allowedRoles={allowedRoles} currentRole={role} />
      <TutorialsModulesList
        modules={modules}
        canManage={canManage}
        defaultRoles={role === "all" ? [userRole] : [role]}
      />
    </div>
  );
}
